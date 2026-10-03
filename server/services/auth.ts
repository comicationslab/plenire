import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AnyRole } from '../auth/tokens';
import type { Db, Queryable } from '../db/adapter';
import { AppError } from './errors';
import { dummyVerify, hashPassword, passwordProblem, verifyPassword } from './passwords';

export type PrincipalType = 'staff' | 'platform';

export interface Principal {
  id: string;
  type: PrincipalType;
  practiceId: string | null;
  practiceName: string | null;
  role: AnyRole;
  name: string;
  email: string;
  status: 'invited' | 'active' | 'disabled';
  practiceStatus: 'active' | 'suspended' | 'removed' | null;
}

export interface AuthSettings { sessionHours: number; idleMinutes: number }

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
/** 256 random bits. Only its hash is ever stored. */
export const newToken = () => randomBytes(32).toString('base64url');

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const toPrincipal = (r: any): Principal => ({
  id: r.id, type: r.type, practiceId: r.practice_id ?? null, practiceName: r.practice_name ?? null, role: r.role,
  name: r.name, email: r.email, status: r.status, practiceStatus: r.practice_status ?? null,
});

const STAFF_SQL = `SELECT s.id, 'staff' AS type, s.practice_id, p.name AS practice_name, p.status AS practice_status, s.role, s.name, s.email, s.status
                     FROM staff s JOIN practices p ON p.id = s.practice_id`;
const ADMIN_SQL = `SELECT a.id, 'platform' AS type, NULL::uuid AS practice_id, NULL::text AS practice_name, NULL::text AS practice_status, 'platform_admin' AS role, a.name, a.email, a.status
                     FROM platform_admins a`;

export async function findByEmail(q: Queryable, email: string): Promise<Principal | null> {
  const rows = await q.query(`${STAFF_SQL} WHERE lower(s.email) = lower($1) UNION ALL ${ADMIN_SQL} WHERE lower(a.email) = lower($1)`, [email]);
  return rows[0] ? toPrincipal(rows[0]) : null;
}

export async function findById(q: Queryable, id: string, type: PrincipalType): Promise<Principal | null> {
  const rows = await q.query(type === 'staff' ? `${STAFF_SQL} WHERE s.id = $1` : `${ADMIN_SQL} WHERE a.id = $1`, [id]);
  return rows[0] ? toPrincipal(rows[0]) : null;
}

async function createSession(q: Queryable, s: AuthSettings, p: Principal, familyId: string, expiresAt: string | null) {
  const raw = newToken();
  const [row] = await q.query<{ id: string }>(
    `INSERT INTO sessions (family_id, principal_id, principal_type, practice_id, token_hash, expires_at)
     VALUES ($1,$2,$3,$4,$5, COALESCE($6::timestamptz, now() + make_interval(hours => $7))) RETURNING id`,
    [familyId, p.id, p.type, p.practiceId, sha256(raw), expiresAt, s.sessionHours],
  );
  return { refreshToken: raw, sessionRowId: row.id };
}

const revokeFamily = (q: Queryable, familyId: string) =>
  q.query('UPDATE sessions SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL', [familyId]);

/** Signs a person out everywhere (optionally keeping the current device). */
export const revokeAllSessions = (q: Queryable, principalId: string, keepFamily?: string) =>
  q.query('UPDATE sessions SET revoked_at = now() WHERE principal_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR family_id <> $2::uuid)', [principalId, keepFamily ?? null]);

// ───────────── sign in ─────────────

export type SessionResult =
  | { ok: true; principal: Principal; refreshToken: string; sid: string }
  | { ok: false; reason: 'invalid' | 'locked' | 'disabled' | 'suspended' | 'reuse' | 'race'; principal?: Principal };

/**
 * Email + password. The slow password check runs OUTSIDE any database transaction so sign-ins never hold
 * a connection while hashing. Wrong passwords count toward a 15-minute lockout after 5 tries.
 */
export async function login(db: Db, s: AuthSettings, email: string, password: string): Promise<SessionResult> {
  const found = await db.auth(async (q) => {
    const principal = await findByEmail(q, email);
    const [cred] = principal
      ? await q.query<{ password_hash: string; locked: boolean }>('SELECT password_hash, (locked_until IS NOT NULL AND locked_until > now()) AS locked FROM credentials WHERE principal_id = $1', [principal.id])
      : [];
    return { principal, cred };
  });
  const { principal, cred } = found;
  if (!principal || !cred) {
    await dummyVerify(password); // same effort whether or not the email exists
    return { ok: false, reason: 'invalid' };
  }
  if (cred.locked) return { ok: false, reason: 'locked', principal };

  if (!(await verifyPassword(password, cred.password_hash))) {
    await db.auth((q) => q.query(
      `UPDATE credentials SET
         locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END,
         failed_attempts = CASE WHEN failed_attempts + 1 >= $2 THEN 0 ELSE failed_attempts + 1 END
       WHERE principal_id = $1`, [principal.id, MAX_FAILED, LOCK_MINUTES]));
    return { ok: false, reason: 'invalid', principal };
  }
  if (principal.status !== 'active') return { ok: false, reason: 'disabled', principal };
  if (principal.practiceStatus && principal.practiceStatus !== 'active') return { ok: false, reason: 'suspended', principal };

  const sess = await db.auth(async (q) => {
    await q.query('UPDATE credentials SET failed_attempts = 0, locked_until = NULL WHERE principal_id = $1', [principal.id]);
    return createSession(q, s, principal, randomUUID(), null);
  });
  return { ok: true, principal, refreshToken: sess.refreshToken, sid: await familyOf(db, sess.sessionRowId) };
}

const familyOf = (db: Db, rowId: string) => db.auth(async (q) => (await q.query<{ family_id: string }>('SELECT family_id FROM sessions WHERE id = $1', [rowId]))[0].family_id);

/**
 * Trades a refresh token for a new one (rotation). Each token works once. If an old token is replayed
 * (stolen cookie), the whole sign-in is revoked. A 10-second grace avoids punishing two browser tabs refreshing together.
 */
export async function refresh(db: Db, s: AuthSettings, raw: string): Promise<SessionResult> {
  return db.auth<SessionResult>(async (q) => {
    const [row] = await q.query<any>(
      `SELECT id, family_id, principal_id, principal_type, expires_at,
              (revoked_at IS NOT NULL) AS revoked, (expires_at <= now()) AS expired,
              (last_used_at < now() - make_interval(mins => $2)) AS idle,
              (revoked_at IS NOT NULL AND replaced_by IS NOT NULL AND revoked_at > now() - interval '10 seconds') AS racing
         FROM sessions WHERE token_hash = $1 FOR UPDATE`,
      [sha256(raw), s.idleMinutes],
    );
    if (!row) return { ok: false, reason: 'invalid' };
    if (row.revoked) {
      if (row.racing) return { ok: false, reason: 'race' };
      await revokeFamily(q, row.family_id);
      return { ok: false, reason: 'reuse' };
    }
    if (row.expired || row.idle) { await revokeFamily(q, row.family_id); return { ok: false, reason: 'invalid' }; }

    const principal = await findById(q, row.principal_id, row.principal_type);
    if (!principal || principal.status !== 'active' || (principal.practiceStatus && principal.practiceStatus !== 'active')) {
      await revokeFamily(q, row.family_id);
      return { ok: false, reason: 'invalid', principal: principal ?? undefined };
    }
    const next = await createSession(q, s, principal, row.family_id, row.expires_at);
    await q.query('UPDATE sessions SET revoked_at = now(), replaced_by = $2 WHERE id = $1', [row.id, next.sessionRowId]);
    return { ok: true, principal, refreshToken: next.refreshToken, sid: row.family_id };
  });
}

export async function logout(db: Db, raw: string): Promise<{ principalId: string; practiceId: string | null } | null> {
  return db.auth(async (q) => {
    const [row] = await q.query<{ family_id: string; principal_id: string; practice_id: string | null }>(
      'SELECT family_id, principal_id, practice_id FROM sessions WHERE token_hash = $1', [sha256(raw)]);
    if (!row) return null;
    await revokeFamily(q, row.family_id);
    return { principalId: row.principal_id, practiceId: row.practice_id };
  });
}

// ───────────── invitations & password reset ─────────────

export type InviteKind = 'staff_invite' | 'password_reset' | 'platform_invite';

/** Creates a single-use link token (any previous unused link of the same kind is cancelled). Returns the raw token ONCE. */
export async function createInvitation(
  q: Queryable,
  o: { kind: InviteKind; principalId: string; principalType: PrincipalType; practiceId: string | null; email: string; createdBy: string | null; hours: number },
): Promise<string> {
  await q.query('UPDATE invitations SET used_at = now() WHERE principal_id = $1 AND kind = $2 AND used_at IS NULL', [o.principalId, o.kind]);
  const raw = newToken();
  await q.query(
    `INSERT INTO invitations (kind, principal_id, principal_type, practice_id, email, token_hash, expires_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6, now() + make_interval(hours => $7), $8)`,
    [o.kind, o.principalId, o.principalType, o.practiceId, o.email, sha256(raw), o.hours, o.createdBy],
  );
  return raw;
}

export interface InviteInfo { kind: InviteKind; email: string; name: string; practiceName: string | null }

export async function peekInvitation(db: Db, raw: string): Promise<InviteInfo> {
  const [r] = await db.auth((q) => q.query<any>(
    `SELECT i.kind, i.email, COALESCE(s.name, a.name) AS name, p.name AS practice_name
       FROM invitations i
       LEFT JOIN practices p ON p.id = i.practice_id
       LEFT JOIN staff s ON s.id = i.principal_id AND i.principal_type = 'staff'
       LEFT JOIN platform_admins a ON a.id = i.principal_id AND i.principal_type = 'platform'
      WHERE i.token_hash = $1 AND i.used_at IS NULL AND i.expires_at > now()`, [sha256(raw)]));
  if (!r) throw new AppError(404, 'INVITE_INVALID', 'This link is invalid or has expired. Ask for a new one.');
  return { kind: r.kind, email: r.email, name: r.name, practiceName: r.practice_name };
}

/** Sets the person's own password from a one-time link (invitation or reset) and signs them in. */
export async function acceptInvitation(db: Db, s: AuthSettings, raw: string, password: string, name?: string): Promise<SessionResult & { kind?: InviteKind }> {
  const info = await peekInvitation(db, raw);
  const problem = passwordProblem(password, { email: info.email, name: name ?? info.name });
  if (problem) throw new AppError(422, 'WEAK_PASSWORD', problem);
  const hash = await hashPassword(password);

  return db.auth(async (q) => {
    const [inv] = await q.query<any>(
      'SELECT id, kind, principal_id, principal_type FROM invitations WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE', [sha256(raw)]);
    if (!inv) throw new AppError(404, 'INVITE_INVALID', 'This link is invalid or has expired. Ask for a new one.');
    const principal = await findById(q, inv.principal_id, inv.principal_type);
    if (!principal) throw new AppError(404, 'INVITE_INVALID');

    await q.query(
      `INSERT INTO credentials (principal_id, principal_type, password_hash) VALUES ($1,$2,$3)
       ON CONFLICT (principal_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, failed_attempts = 0, locked_until = NULL, password_changed_at = now()`,
      [principal.id, principal.type, hash]);
    if (inv.kind !== 'password_reset') {
      if (principal.type === 'staff') await q.query("UPDATE staff SET status = 'active', accepted_at = COALESCE(accepted_at, now()), name = COALESCE($2, name) WHERE id = $1", [principal.id, name?.trim() || null]);
      else await q.query("UPDATE platform_admins SET status = 'active', name = COALESCE($2, name) WHERE id = $1", [principal.id, name?.trim() || null]);
    }
    await q.query('UPDATE invitations SET used_at = now() WHERE principal_id = $1 AND used_at IS NULL', [principal.id]);
    await revokeAllSessions(q, principal.id);

    const fresh = (await findById(q, principal.id, principal.type))!;
    if (fresh.practiceStatus && fresh.practiceStatus !== 'active') return { ok: false, reason: 'suspended' as const, principal: fresh };
    const sess = await createSession(q, s, fresh, randomUUID(), null);
    const [{ family_id }] = await q.query<{ family_id: string }>('SELECT family_id FROM sessions WHERE id = $1', [sess.sessionRowId]);
    return { ok: true as const, principal: fresh, refreshToken: sess.refreshToken, sid: family_id, kind: inv.kind as InviteKind };
  });
}

/** Starts a password reset. Always looks the same from outside, whether or not the email exists. */
export async function startPasswordReset(db: Db, email: string): Promise<{ principal: Principal; token: string } | null> {
  return db.auth(async (q) => {
    const principal = await findByEmail(q, email);
    if (!principal || principal.status !== 'active' || (principal.practiceStatus && principal.practiceStatus !== 'active')) return null;
    const token = await createInvitation(q, { kind: 'password_reset', principalId: principal.id, principalType: principal.type, practiceId: principal.practiceId, email: principal.email, createdBy: null, hours: 1 });
    return { principal, token };
  });
}

/**
 * "Type your password to confirm" for risky actions (editing a patient, removing a clinic). Checked on the SERVER, so a hidden button or a
 * tampered browser cannot skip it. Wrong tries share the sign-in lockout (5 wrong = 15 minutes), so a borrowed, already signed-in screen
 * cannot be used to guess the password.
 */
export async function confirmPassword(db: Db, principalId: string, password: unknown): Promise<void> {
  if (typeof password !== 'string' || !password) throw new AppError(403, 'PASSWORD_REQUIRED', 'Enter your password to confirm this change');
  const [cred] = await db.auth((q) => q.query<{ password_hash: string; locked: boolean }>(
    'SELECT password_hash, (locked_until IS NOT NULL AND locked_until > now()) AS locked FROM credentials WHERE principal_id = $1', [principalId]));
  if (!cred) throw new AppError(403, 'WRONG_PASSWORD', 'Password is not correct');
  if (cred.locked) throw new AppError(429, 'LOCKED', 'Too many wrong passwords. Try again in 15 minutes.');
  if (!(await verifyPassword(password, cred.password_hash))) {
    await db.auth((q) => q.query(
      `UPDATE credentials SET
         locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END,
         failed_attempts = CASE WHEN failed_attempts + 1 >= $2 THEN 0 ELSE failed_attempts + 1 END
       WHERE principal_id = $1`, [principalId, MAX_FAILED, LOCK_MINUTES]));
    throw new AppError(403, 'WRONG_PASSWORD', 'Password is not correct');
  }
  await db.auth((q) => q.query('UPDATE credentials SET failed_attempts = 0 WHERE principal_id = $1', [principalId]));
}

export async function changePassword(db: Db, who: { id: string; type: PrincipalType; email: string; name: string }, sid: string | undefined, current: string, next: string) {
  const [cred] = await db.auth((q) => q.query<{ password_hash: string }>('SELECT password_hash FROM credentials WHERE principal_id = $1', [who.id]));
  if (!cred || !(await verifyPassword(current, cred.password_hash))) throw new AppError(403, 'WRONG_PASSWORD', 'Your current password is not correct');
  const problem = passwordProblem(next, who);
  if (problem) throw new AppError(422, 'WEAK_PASSWORD', problem);
  if (next === current) throw new AppError(422, 'WEAK_PASSWORD', 'Choose a different password from your current one');
  const hash = await hashPassword(next);
  await db.auth(async (q) => {
    await q.query('UPDATE credentials SET password_hash = $2, failed_attempts = 0, locked_until = NULL, password_changed_at = now() WHERE principal_id = $1', [who.id, hash]);
    await revokeAllSessions(q, who.id, sid); // every other device is signed out
  });
}
