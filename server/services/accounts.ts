import type { AnyRole, Role } from '../auth/tokens';
import type { Db, Queryable } from '../db/adapter';
import { audit, type Ctx } from './audit';
import { createInvitation, revokeAllSessions } from './auth';
import { AppError } from './errors';

const isUnique = (e: unknown) => (e as { code?: string })?.code === '23505';
const INVITE_HOURS = 72;
export const inviteHours = INVITE_HOURS;

// ───────────── a practice owner managing their own team (runs as the practice, locked to it) ─────────────

export interface StaffRow { id: string; name: string; email: string; role: Role; status: 'invited' | 'active' | 'disabled'; acceptedAt: string | null }

export const listStaff = (q: Queryable) =>
  q.query<StaffRow>(`SELECT id, name, email, role, status, accepted_at AS "acceptedAt" FROM staff ORDER BY (status = 'disabled'), name`);

export async function inviteStaff(q: Queryable, ctx: Ctx, input: { email: string; name: string; role: Role }) {
  const [limit] = await q.query<{ staff_limit: number; used: number }>(
    `SELECT p.staff_limit, (SELECT count(*)::int FROM staff WHERE status IN ('active','invited')) AS used FROM practices p WHERE p.id = $1`, [ctx.practiceId]);
  if (limit.used >= limit.staff_limit) throw new AppError(409, 'STAFF_LIMIT', `Your plan allows ${limit.staff_limit} team members. Contact us to add more.`);
  let id: string;
  try {
    [{ id }] = await q.query<{ id: string }>(`INSERT INTO staff (practice_id, email, name, role, status) VALUES ($1,$2,$3,$4,'invited') RETURNING id`,
      [ctx.practiceId, input.email, input.name, input.role]);
  } catch (e) {
    if (isUnique(e)) throw new AppError(409, 'EMAIL_IN_USE', 'That email already has a Plenire account');
    throw e;
  }
  const token = await createInvitation(q, { kind: 'staff_invite', principalId: id, principalType: 'staff', practiceId: ctx.practiceId, email: input.email, createdBy: ctx.actorId, hours: INVITE_HOURS });
  await audit(q, ctx, 'STAFF_INVITED', { staffId: id, role: input.role });
  return { staffId: id, token };
}

export async function resendInvite(q: Queryable, ctx: Ctx, staffId: string) {
  const [s] = await q.query<{ email: string; status: string }>('SELECT email, status FROM staff WHERE id = $1', [staffId]);
  if (!s) throw new AppError(404, 'STAFF_NOT_FOUND');
  if (s.status !== 'invited') throw new AppError(409, 'NOT_PENDING', 'This person has already set up their account');
  const token = await createInvitation(q, { kind: 'staff_invite', principalId: staffId, principalType: 'staff', practiceId: ctx.practiceId, email: s.email, createdBy: ctx.actorId, hours: INVITE_HOURS });
  await audit(q, ctx, 'STAFF_INVITE_RESENT', { staffId });
  return { email: s.email, token };
}

/** Change a role or switch someone off/on. Guards: you can't lock yourself out, and a practice always keeps an owner. */
export async function updateStaff(q: Queryable, ctx: Ctx, staffId: string, change: { role?: Role; active?: boolean }) {
  const [t] = await q.query<{ role: Role; status: string; accepted_at: string | null }>('SELECT role, status, accepted_at FROM staff WHERE id = $1 FOR UPDATE', [staffId]);
  if (!t) throw new AppError(404, 'STAFF_NOT_FOUND');
  const demoting = change.role !== undefined && change.role !== t.role;
  const disabling = change.active === false && t.status !== 'disabled';
  if (staffId === ctx.actorId && (demoting || disabling)) throw new AppError(409, 'CANNOT_MODIFY_SELF', 'You cannot change your own access. Ask another owner.');
  if (t.role === 'owner' && t.status === 'active' && (disabling || (demoting && change.role !== 'owner'))) {
    const [{ n }] = await q.query<{ n: number }>("SELECT count(*)::int AS n FROM staff WHERE role = 'owner' AND status = 'active' AND id <> $1", [staffId]);
    if (n < 1) throw new AppError(409, 'LAST_OWNER', 'A practice needs at least one active owner');
  }
  if (demoting) {
    await q.query('UPDATE staff SET role = $2 WHERE id = $1', [staffId, change.role]);
    await revokeAllSessions(q, staffId); // their old access token expires within minutes; this ends their session
    await audit(q, ctx, 'STAFF_ROLE_CHANGED', { staffId, role: change.role });
  }
  if (disabling) {
    await q.query("UPDATE staff SET status = 'disabled' WHERE id = $1", [staffId]);
    await revokeAllSessions(q, staffId);
    await audit(q, ctx, 'STAFF_DISABLED', { staffId });
  } else if (change.active === true && t.status === 'disabled') {
    await q.query("UPDATE staff SET status = CASE WHEN accepted_at IS NULL THEN 'invited' ELSE 'active' END WHERE id = $1", [staffId]);
    await audit(q, ctx, 'STAFF_ENABLED', { staffId });
  }
}

export async function addProvider(q: Queryable, ctx: Ctx, p: { name: string; initials: string; chair: string | null; title: string | null }) {
  const [r] = await q.query<{ id: string }>('INSERT INTO providers (practice_id, name, initials, chair, title) VALUES ($1,$2,$3,$4,$5) RETURNING id', [ctx.practiceId, p.name, p.initials, p.chair, p.title]);
  await audit(q, ctx, 'PROVIDER_ADDED', { providerId: r.id });
  return r.id;
}

export async function updateProvider(q: Queryable, ctx: Ctx, id: string, p: { name?: string; initials?: string; chair?: string | null; title?: string | null; active?: boolean }) {
  const [r] = await q.query(
    `UPDATE providers SET name = COALESCE($2, name), initials = COALESCE($3, initials), chair = CASE WHEN $4::boolean THEN $5 ELSE chair END,
            title = CASE WHEN $6::boolean THEN $7 ELSE title END, active = COALESCE($8, active) WHERE id = $1 RETURNING id`,
    [id, p.name ?? null, p.initials ?? null, p.chair !== undefined, p.chair ?? null, p.title !== undefined, p.title ?? null, p.active ?? null]);
  if (!r) throw new AppError(404, 'PROVIDER_NOT_FOUND');
  await audit(q, ctx, 'PROVIDER_UPDATED', { providerId: id });
}

// ───────────── the SaaS operator console (platform admins; no patient-data access) ─────────────

export const platformAudit = (q: Queryable, actorId: string | null, action: string, details: Record<string, unknown> = {}) =>
  q.query('INSERT INTO platform_audit (actor_id, action, details) VALUES ($1,$2,$3)', [actorId, action, JSON.stringify(details)]);

export interface NewPractice { name: string; phone: string; address?: string | null; timezone: string; ownerName: string; ownerEmail: string; staffLimit?: number; plan?: string }

/** Creates a practice and invites its first owner. The owner sets their own password from the link. */
export async function provisionPractice(db: Db, actorId: string, p: NewPractice) {
  try {
    return await db.platform(async (q) => {
      const [tz] = await q.query<{ ok: boolean }>('SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = $1) AS ok', [p.timezone]);
      if (!tz.ok) throw new AppError(422, 'BAD_TIMEZONE', 'Unknown time zone. Use a name like America/Chicago.');
      const [prac] = await q.query<{ id: string }>(
        'INSERT INTO practices (name, phone, address, timezone, staff_limit, plan) VALUES ($1,$2,$3,$4,COALESCE($5,25),COALESCE($6,\'trial\')) RETURNING id',
        [p.name, p.phone, p.address ?? null, p.timezone, p.staffLimit ?? null, p.plan ?? null]);
      const [owner] = await q.query<{ id: string }>(
        "INSERT INTO staff (practice_id, email, name, role, status) VALUES ($1,$2,$3,'owner','invited') RETURNING id", [prac.id, p.ownerEmail, p.ownerName]);
      const token = await createInvitation(q, { kind: 'staff_invite', principalId: owner.id, principalType: 'staff', practiceId: prac.id, email: p.ownerEmail, createdBy: actorId, hours: INVITE_HOURS });
      await platformAudit(q, actorId, 'PRACTICE_CREATED', { practiceId: prac.id });
      return { practiceId: prac.id, ownerId: owner.id, token };
    });
  } catch (e) {
    if (isUnique(e)) throw new AppError(409, 'EMAIL_IN_USE', 'That email already has a Plenire account');
    throw e;
  }
}

export const listPractices = (db: Db) =>
  db.platform((q) => q.query(
    `SELECT p.id, p.name, p.phone, p.timezone, p.status, p.plan, p.staff_limit AS "staffLimit", p.created_at AS "createdAt",
            (SELECT count(*)::int FROM staff s WHERE s.practice_id = p.id AND s.status = 'active') AS "activeStaff",
            (SELECT count(*)::int FROM staff s WHERE s.practice_id = p.id AND s.status = 'invited') AS "pendingInvites",
            (SELECT s.email FROM staff s WHERE s.practice_id = p.id AND s.role = 'owner' ORDER BY s.created_at LIMIT 1) AS "ownerEmail",
            (SELECT max(se.last_used_at) FROM sessions se WHERE se.practice_id = p.id) AS "lastActiveAt"
       FROM practices p ORDER BY p.created_at DESC LIMIT 1000`));

export async function updatePractice(db: Db, actorId: string, id: string, c: { status?: 'active' | 'suspended'; plan?: string; staffLimit?: number }) {
  await db.platform(async (q) => {
    const [r] = await q.query('UPDATE practices SET status = COALESCE($2, status), plan = COALESCE($3, plan), staff_limit = COALESCE($4, staff_limit) WHERE id = $1 RETURNING id',
      [id, c.status ?? null, c.plan ?? null, c.staffLimit ?? null]);
    if (!r) throw new AppError(404, 'PRACTICE_NOT_FOUND');
    if (c.status === 'suspended') await q.query('UPDATE sessions SET revoked_at = now() WHERE practice_id = $1 AND revoked_at IS NULL', [id]);
    await platformAudit(q, actorId, 'PRACTICE_UPDATED', { practiceId: id, ...c });
  });
}

/** Sends the practice a fresh owner invitation (for a lost link, or to hand the practice to a different owner email). */
export async function reinviteOwner(db: Db, actorId: string, practiceId: string, email?: string, name?: string) {
  try {
    return await db.platform(async (q) => {
      const [prac] = await q.query<{ id: string }>('SELECT id FROM practices WHERE id = $1', [practiceId]);
      if (!prac) throw new AppError(404, 'PRACTICE_NOT_FOUND');
      let owner: { id: string; email: string } | undefined;
      if (email) {
        [owner] = await q.query<{ id: string; email: string }>("INSERT INTO staff (practice_id, email, name, role, status) VALUES ($1,$2,$3,'owner','invited') RETURNING id, email", [practiceId, email, name ?? email]);
      } else {
        [owner] = await q.query<{ id: string; email: string }>("SELECT id, email FROM staff WHERE practice_id = $1 AND role = 'owner' AND status = 'invited' ORDER BY created_at LIMIT 1", [practiceId]);
        if (!owner) throw new AppError(409, 'NO_PENDING_OWNER', 'The owner has already set up their account. Use "Add another owner" with a new email.');
      }
      const token = await createInvitation(q, { kind: 'staff_invite', principalId: owner.id, principalType: 'staff', practiceId, email: owner.email, createdBy: actorId, hours: INVITE_HOURS });
      await platformAudit(q, actorId, 'OWNER_INVITED', { practiceId, staffId: owner.id });
      return { email: owner.email, token };
    });
  } catch (e) {
    if (isUnique(e)) throw new AppError(409, 'EMAIL_IN_USE', 'That email already has a Plenire account');
    throw e;
  }
}

export const listAdmins = (db: Db) => db.platform((q) => q.query('SELECT id, name, email, status, created_at AS "createdAt" FROM platform_admins ORDER BY created_at'));

export async function inviteAdmin(db: Db, actorId: string | null, a: { email: string; name: string }) {
  try {
    return await db.platform(async (q) => {
      const [row] = await q.query<{ id: string }>("INSERT INTO platform_admins (email, name, status) VALUES ($1,$2,'invited') RETURNING id", [a.email, a.name]);
      const token = await createInvitation(q, { kind: 'platform_invite', principalId: row.id, principalType: 'platform', practiceId: null, email: a.email, createdBy: actorId, hours: INVITE_HOURS });
      await platformAudit(q, actorId, 'ADMIN_INVITED', { adminId: row.id });
      return { adminId: row.id, token };
    });
  } catch (e) {
    if (isUnique(e)) throw new AppError(409, 'EMAIL_IN_USE', 'That email already has a Plenire account');
    throw e;
  }
}

export type { AnyRole };
