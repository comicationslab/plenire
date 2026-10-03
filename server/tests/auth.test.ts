import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../app';
import { localTokens } from '../auth/tokens';
import { loadConfig } from '../config';
import type { Db } from '../db/adapter';
import { DEMO_PASSWORD, DEMO_STAFF, seedPlatformAdmin, seedPractice, type SeededPractice } from '../db/seed';
import { hashPassword, passwordProblem, verifyPassword } from '../services/passwords';
import type { Email } from '../services/email';
import { backend, freshDb } from './helpers';

const STRONG = 'Orange-Falcon-Lantern-27';

describe('password rules', () => {
  it('hashes with a random salt and verifies only the right password', async () => {
    const a = await hashPassword(STRONG);
    const b = await hashPassword(STRONG);
    assert.notEqual(a, b, 'same password, different salt');
    assert.match(a, /^scrypt\$\d+\$8\$3\$/);
    assert.ok(!a.includes(STRONG));
    assert.equal(await verifyPassword(STRONG, a), true);
    assert.equal(await verifyPassword(STRONG + '!', a), false);
    assert.equal(await verifyPassword(STRONG, 'garbage'), false);
  });
  it('rejects weak passwords with a helpful reason', () => {
    for (const bad of ['short1', 'password1234', 'aaaaaaaaaaaaaa', 'MyPassword-2026!', '123456789012']) assert.ok(passwordProblem(bad), bad);
    assert.ok(passwordProblem('johnsmith-is-great-1', { email: 'johnsmith@x.com' }), 'contains email name');
    assert.ok(passwordProblem('Dana-Reyes-2026-xx', { name: 'Dana Reyes' }), 'contains name');
    assert.equal(passwordProblem(STRONG, { email: 'a@b.com' }), null);
  });
});

describe(`accounts, sign-in and the SaaS operator console (${backend()})`, () => {
  let db: Db, A: SeededPractice, B: SeededPractice, adminId: string, app: ReturnType<typeof createApp>;
  const tokens = localTokens('a-test-secret-that-is-at-least-32-characters-long');
  const mails: Email[] = [];
  const cfg = { CORS_ORIGINS: '', ENABLE_SIMULATOR: 'true' as const, AUTH_RATE_LIMIT_PER_MINUTE: 10_000 };

  const call = async (method: string, path: string, o: { token?: string; body?: unknown; cookie?: string; csrf?: boolean } = {}) => {
    const res = await app.request(path, {
      method,
      headers: {
        ...(o.token ? { authorization: `Bearer ${o.token}` } : {}),
        ...(o.cookie ? { cookie: o.cookie } : {}),
        ...(o.csrf ? { 'x-plenire-csrf': '1' } : {}),
        ...(o.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie') ?? '';
    return { status: res.status, json: (await res.json().catch(() => null)) as any, setCookie, cookie: /plenire_rt=([^;]+)/.exec(setCookie)?.[0] };
  };
  const login = (email: string, password = DEMO_PASSWORD) => call('POST', '/auth/login', { body: { email, password } });
  const tokenOf = (link: string) => new URL(link).searchParams.get('token')!;
  const sql = <T,>(fn: Parameters<Db['admin']>[0]) => db.admin(fn) as Promise<T>;

  before(async () => {
    db = await freshDb();
    A = await seedPractice(db, { name: 'Lakeside Dental', phone: '(555) 010-0100', staff: DEMO_STAFF });
    B = await seedPractice(db, { name: 'Other Dental', phone: '(555) 020-0200', staff: [{ email: 'owner@other.test', name: 'Olive Owner', role: 'owner', password: DEMO_PASSWORD }], withSchedule: false });
    adminId = await seedPlatformAdmin(db, 'admin@plenire.test', 'Platform Admin', DEMO_PASSWORD);
    app = createApp({ db, verifier: tokens, tokens, provider: { send: async () => {} }, email: { send: async (m) => void mails.push(m) }, config: cfg });
  });
  after(() => db.close());

  // ───────────── sign-in ─────────────
  it('signs in with the right password and the token opens the practice', async () => {
    const r = await login('mensah@lakeside.test');
    assert.equal(r.status, 200);
    assert.equal(r.json.user.role, 'owner');
    assert.equal(r.json.user.practiceName, 'Lakeside Dental');
    assert.equal((await call('GET', '/api/me', { token: r.json.accessToken })).json.name, 'Dr. Kwame Mensah');
  });

  it('refresh cookie is HttpOnly, SameSite=Strict, scoped to /auth and not readable from the response body', async () => {
    const r = await login('tracy@lakeside.test');
    assert.match(r.setCookie, /HttpOnly/i);
    assert.match(r.setCookie, /SameSite=Strict/i);
    assert.match(r.setCookie, /Path=\/auth/i);
    assert.ok(!JSON.stringify(r.json).includes(r.cookie!.split('=')[1]), 'refresh token never appears in the body');
  });

  it('wrong password and unknown email look identical (no account enumeration)', async () => {
    const a = await login('tracy@lakeside.test', 'wrong-password-123');
    const b = await login('nobody@nowhere.test', 'wrong-password-123');
    assert.equal(a.status, 401);
    assert.deepEqual(a.json, b.json);
  });

  it('locks the account after 5 wrong attempts, even for the right password; unlocks after the wait', async () => {
    const email = 'locked@lakeside.test';
    await seedStaff(email, 'Lock Test');
    for (let i = 0; i < 5; i++) assert.equal((await login(email, 'wrong-password-123')).status, 401);
    const blocked = await login(email);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.json.error.code, 'ACCOUNT_LOCKED');
    await sql((q) => q.query("UPDATE credentials SET locked_until = now() - interval '1 minute' WHERE principal_id = (SELECT id FROM staff WHERE email = $1)", [email]));
    assert.equal((await login(email)).status, 200);
  });

  it('an invited person with no password yet cannot sign in; a switched-off one gets a clear message', async () => {
    const t = (await login('mensah@lakeside.test')).json.accessToken;
    const inv = await call('POST', '/api/staff/invite', { token: t, body: { email: 'pending@lakeside.test', name: 'Pending Person', role: 'front_desk' } });
    assert.equal(inv.status, 201);
    assert.equal((await login('pending@lakeside.test', STRONG)).status, 401);
    await seedStaff('off@lakeside.test', 'Switched Off', 'disabled');
    const off = await login('off@lakeside.test');
    assert.equal(off.status, 403);
    assert.equal(off.json.error.code, 'ACCOUNT_DISABLED');
  });

  it('rate-limits sign-in attempts per client', async () => {
    const limited = createApp({ db, verifier: tokens, tokens, provider: { send: async () => {} }, config: { ...cfg, AUTH_RATE_LIMIT_PER_MINUTE: 3 } });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await limited.request('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'x@y.test', password: 'nope-nope-nope' }) })).status);
    assert.deepEqual(codes, [401, 401, 401, 429, 429]);
  });

  // ───────────── sessions ─────────────
  it('refresh rotates the token; replaying an old one ends the whole sign-in', async () => {
    const first = await login('tracy@lakeside.test');
    const r1 = await call('POST', '/auth/refresh', { cookie: first.cookie, csrf: true });
    assert.equal(r1.status, 200);
    assert.notEqual(r1.cookie, first.cookie, 'new refresh token each time');
    assert.equal((await call('GET', '/api/me', { token: r1.json.accessToken })).status, 200);

    await sql((q) => q.query("UPDATE sessions SET revoked_at = now() - interval '1 minute' WHERE replaced_by IS NOT NULL")); // pretend the grace window has passed
    const replay = await call('POST', '/auth/refresh', { cookie: first.cookie, csrf: true });
    assert.equal(replay.status, 401);
    assert.equal((await call('POST', '/auth/refresh', { cookie: r1.cookie, csrf: true })).status, 401, 'the legitimate newer token is revoked too');
  });

  it('refresh requires the cookie and our request header', async () => {
    const r = await login('tracy@lakeside.test');
    assert.equal((await call('POST', '/auth/refresh', { cookie: r.cookie })).status, 403, 'no CSRF header');
    assert.equal((await call('POST', '/auth/refresh', { csrf: true })).status, 401, 'no cookie');
    assert.equal((await call('POST', '/auth/refresh', { cookie: 'plenire_rt=made-up', csrf: true })).status, 401);
  });

  it('idle sessions end; sign-out ends the session', async () => {
    const r = await login('tracy@lakeside.test');
    await sql((q) => q.query("UPDATE sessions SET last_used_at = now() - interval '2 hours' WHERE revoked_at IS NULL AND principal_id = (SELECT id FROM staff WHERE email = 'tracy@lakeside.test')"));
    assert.equal((await call('POST', '/auth/refresh', { cookie: r.cookie, csrf: true })).status, 401, 'idle too long');

    const r2 = await login('tracy@lakeside.test');
    assert.equal((await call('POST', '/auth/logout', { cookie: r2.cookie, csrf: true })).status, 200);
    assert.equal((await call('POST', '/auth/refresh', { cookie: r2.cookie, csrf: true })).status, 401);
  });

  // ───────────── invitations & reset ─────────────
  it('invitation: peek, weak password refused, strong accepted, link works once, and the person is signed in', async () => {
    const t = (await login('mensah@lakeside.test')).json.accessToken;
    const inv = await call('POST', '/api/staff/invite', { token: t, body: { email: 'new.hire@lakeside.test', name: 'New Hire', role: 'front_desk' } });
    const token = tokenOf(inv.json.inviteLink);
    assert.ok(mails.some((m) => m.to === 'new.hire@lakeside.test' && m.text.includes(token)), 'invitation emailed');

    const peek = await call('GET', `/auth/invitations/${token}`);
    assert.deepEqual([peek.json.email, peek.json.practiceName], ['new.hire@lakeside.test', 'Lakeside Dental']);
    const weak = await call('POST', '/auth/accept-invite', { body: { token, password: 'password1234' } });
    assert.equal(weak.status, 422);
    assert.equal(weak.json.error.code, 'WEAK_PASSWORD');

    const ok = await call('POST', '/auth/accept-invite', { body: { token, password: STRONG } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.user.role, 'front_desk');
    assert.ok(ok.cookie);
    assert.equal((await call('POST', '/auth/accept-invite', { body: { token, password: STRONG } })).status, 404, 'single use');
    assert.equal((await login('new.hire@lakeside.test', STRONG)).status, 200, 'their own password now works');
  });

  it('expired or invented links are rejected', async () => {
    const t = (await login('mensah@lakeside.test')).json.accessToken;
    const inv = await call('POST', '/api/staff/invite', { token: t, body: { email: 'late@lakeside.test', name: 'Late', role: 'hygienist' } });
    const token = tokenOf(inv.json.inviteLink);
    await sql((q) => q.query("UPDATE invitations SET expires_at = now() - interval '1 minute' WHERE email = 'late@lakeside.test'"));
    assert.equal((await call('GET', `/auth/invitations/${token}`)).status, 404);
    assert.equal((await call('POST', '/auth/accept-invite', { body: { token, password: STRONG } })).status, 404);
    assert.equal((await call('POST', '/auth/accept-invite', { body: { token: 'x'.repeat(43), password: STRONG } })).status, 404);
  });

  it('resending an invitation cancels the old link', async () => {
    const t = (await login('mensah@lakeside.test')).json.accessToken;
    const inv = await call('POST', '/api/staff/invite', { token: t, body: { email: 'resend@lakeside.test', name: 'Resend', role: 'dentist' } });
    const oldToken = tokenOf(inv.json.inviteLink);
    const again = await call('POST', `/api/staff/${inv.json.staffId}/resend`, { token: t });
    assert.equal(again.status, 201);
    assert.equal((await call('GET', `/auth/invitations/${oldToken}`)).status, 404);
    assert.equal((await call('GET', `/auth/invitations/${tokenOf(again.json.inviteLink)}`)).status, 200);
  });

  it('forgot password: same answer for any email; reset signs out every device and kills the old password', async () => {
    const real = await call('POST', '/auth/forgot', { body: { email: 'tracy@lakeside.test' } });
    const fake = await call('POST', '/auth/forgot', { body: { email: 'ghost@nowhere.test' } });
    assert.equal(real.status, 202);
    assert.equal(fake.status, 202);
    assert.equal(fake.json.devLink, undefined);

    const device = await login('tracy@lakeside.test');
    const token = tokenOf((await call('POST', '/auth/forgot', { body: { email: 'tracy@lakeside.test' } })).json.devLink);
    assert.ok(mails.some((m) => m.subject.includes('Reset') && m.text.includes(token)));
    const reset = await call('POST', '/auth/reset', { body: { token, password: 'Violet-Anchor-Meadow-81' } });
    assert.equal(reset.status, 200);
    assert.equal((await call('POST', '/auth/refresh', { cookie: device.cookie, csrf: true })).status, 401, 'old device signed out');
    assert.equal((await login('tracy@lakeside.test')).status, 401, 'old password dead');
    assert.equal((await login('tracy@lakeside.test', 'Violet-Anchor-Meadow-81')).status, 200);
    assert.equal((await call('POST', '/auth/reset', { body: { token, password: 'Another-Strong-Pass-55' } })).status, 404, 'single use');
    await sql((q) => q.query("UPDATE credentials SET password_hash = (SELECT password_hash FROM credentials WHERE principal_id = $1) WHERE principal_id = (SELECT id FROM staff WHERE email = 'tracy@lakeside.test')", [A.staff['mensah@lakeside.test'].id]));
  });

  it('change password: needs the current one; signs out other devices but keeps this one', async () => {
    const here = await login('mensah@lakeside.test');
    const other = await login('mensah@lakeside.test');
    const t = here.json.accessToken;
    assert.equal((await call('POST', '/api/account/password', { token: t, body: { currentPassword: 'wrong-password-123', newPassword: STRONG } })).status, 403);
    assert.equal((await call('POST', '/api/account/password', { token: t, body: { currentPassword: DEMO_PASSWORD, newPassword: 'weak' } })).status, 422);
    assert.equal((await call('POST', '/api/account/password', { token: t, body: { currentPassword: DEMO_PASSWORD, newPassword: STRONG } })).status, 200);
    assert.equal((await call('POST', '/auth/refresh', { cookie: here.cookie, csrf: true })).status, 200, 'this device stays signed in');
    assert.equal((await call('POST', '/auth/refresh', { cookie: other.cookie, csrf: true })).status, 401, 'other device signed out');
    assert.equal((await login('mensah@lakeside.test', STRONG)).status, 200);
    await call('POST', '/api/account/password', { token: (await login('mensah@lakeside.test', STRONG)).json.accessToken, body: { currentPassword: STRONG, newPassword: DEMO_PASSWORD + '-x' } });
    // restore the demo password for later tests
    await sql(async (q) => { await q.query("UPDATE credentials SET password_hash = $2 WHERE principal_id = $1", [A.staff['mensah@lakeside.test'].id, await hashPassword(DEMO_PASSWORD)]); });
  });

  // ───────────── the operator console ─────────────
  it('platform admin creates a practice; the owner sets their own password and lands in an empty, isolated practice', async () => {
    const admin = (await login('admin@plenire.test')).json;
    assert.equal(admin.user.role, 'platform_admin');
    assert.equal(admin.user.practiceId, null);

    const made = await call('POST', '/api/platform/practices', { token: admin.accessToken, body: { name: 'Riverbend Family Dental', phone: '(555) 010-0300', timezone: 'America/New_York', ownerName: 'Dana Reyes', ownerEmail: 'Dana@Riverbend.test' } });
    assert.equal(made.status, 201);
    assert.equal(made.json.ownerEmail, 'dana@riverbend.test', 'emails are normalised');
    const owner = await call('POST', '/auth/accept-invite', { body: { token: tokenOf(made.json.inviteLink), password: STRONG } });
    assert.equal(owner.json.user.practiceName, 'Riverbend Family Dental');
    assert.equal((await call('GET', '/api/patients', { token: owner.json.accessToken })).json.length, 0);
    assert.equal((await call('GET', '/api/staff', { token: owner.json.accessToken })).json.length, 1);

    const list = (await call('GET', '/api/platform/practices', { token: admin.accessToken })).json;
    const row = list.find((p: any) => p.name === 'Riverbend Family Dental');
    assert.deepEqual([row.status, row.activeStaff, row.pendingInvites, row.ownerEmail], ['active', 1, 0, 'dana@riverbend.test']);
    assert.equal((await call('POST', '/api/platform/practices', { token: admin.accessToken, body: { name: 'Dup', phone: '5550100', timezone: 'America/Chicago', ownerName: 'X', ownerEmail: 'dana@riverbend.test' } })).status, 409, 'email unique across the platform');
    assert.equal((await call('POST', '/api/platform/practices', { token: admin.accessToken, body: { name: 'Bad TZ', phone: '5550100', timezone: 'Mars/Olympus', ownerName: 'X', ownerEmail: 'x@y.test' } })).status, 422);
  });

  it('removing a clinic needs the admin\'s password; it signs everyone out, keeps the data, and can be restored', async () => {
    const admin = (await login('admin@plenire.test')).json.accessToken;
    const ownerLogin = (await login('owner@other.test')).json;
    assert.ok(ownerLogin.accessToken, 'the clinic owner can sign in before removal');
    const remove = (body?: unknown) => call('POST', `/api/platform/practices/${B.practiceId}/remove`, { token: admin, body });

    assert.equal((await remove({})).json.error.code, 'PASSWORD_REQUIRED');
    assert.equal((await remove({ password: 'not-the-password-1' })).json.error.code, 'WRONG_PASSWORD');
    assert.equal((await call('POST', `/api/platform/practices/${B.practiceId}/remove`, { token: ownerLogin.accessToken, body: { password: DEMO_PASSWORD } })).status, 403, 'a clinic owner cannot remove clinics');
    assert.equal((await sql<any[]>((q) => q.query('SELECT status FROM practices WHERE id = $1', [B.practiceId])))[0].status, 'active', 'nothing happened without the right password');

    assert.equal((await remove({ password: DEMO_PASSWORD })).status, 200);
    assert.equal((await sql<any[]>((q) => q.query('SELECT status FROM practices WHERE id = $1', [B.practiceId])))[0].status, 'removed');
    assert.equal((await login('owner@other.test')).status, 403, 'nobody can sign in to a removed clinic');
    assert.equal((await sql<any[]>((q) => q.query('SELECT count(*)::int AS n FROM sessions WHERE practice_id = $1 AND revoked_at IS NULL', [B.practiceId])))[0].n, 0, 'everyone signed out');
    assert.equal((await remove({ password: DEMO_PASSWORD })).status, 404, 'already removed');
    assert.equal((await call('PATCH', `/api/platform/practices/${B.practiceId}`, { token: admin, body: { status: 'active' } })).status, 404, 'a removed clinic is restored, not un-paused');
    const row = (await call('GET', '/api/platform/practices', { token: admin })).json.find((p: any) => p.id === B.practiceId);
    assert.equal(row.status, 'removed', 'still listed (as removed) so it can be restored');
    assert.equal((await sql<any[]>((q) => q.query("SELECT count(*)::int AS n FROM platform_audit WHERE action = 'PRACTICE_REMOVED'")))[0].n, 1);

    assert.equal((await call('POST', `/api/platform/practices/${B.practiceId}/restore`, { token: admin, body: {} })).status, 200);
    assert.ok((await login('owner@other.test')).json.accessToken, 'the owner can sign in again after restore');
  });

  it('only platform admins reach /admin; platform admins cannot open practice data', async () => {
    const owner = (await login('owner@other.test')).json.accessToken;
    const admin = (await login('admin@plenire.test')).json.accessToken;
    assert.equal((await call('GET', '/api/platform/practices', { token: owner })).status, 403);
    assert.equal((await call('GET', '/api/platform/practices')).status, 401);
    assert.equal((await call('GET', '/api/patients', { token: admin })).status, 403);
    assert.equal((await call('GET', '/api/audit', { token: admin })).status, 403);
  });

  it('even with direct database access, the platform role cannot read patient data or passwords', async () => {
    const deny = (fn: (q: any) => Promise<unknown>, role: 'platform' | 'auth' | 'app') =>
      assert.rejects((role === 'platform' ? db.platform(fn) : role === 'auth' ? db.auth(fn) : db.tenant(A.practiceId, fn)), /permission denied|violates row-level|does not exist/i);
    for (const t of ['patients', 'appointments', 'messages', 'openings', 'offers', 'audit_log', 'waitlist_entries', 'credentials']) {
      await deny((q) => q.query(`SELECT * FROM ${t} LIMIT 1`), 'platform');
    }
    await deny((q) => q.query('SELECT password_hash FROM credentials'), 'app');
    await deny((q) => q.query('SELECT * FROM patients'), 'auth');
    await deny((q) => q.query('SELECT * FROM messages'), 'auth');
  });

  it('suspending a practice signs everyone out and blocks sign-in until reactivated', async () => {
    const admin = (await login('admin@plenire.test')).json.accessToken;
    const session = await login('owner@other.test');
    await call('PATCH', `/api/platform/practices/${B.practiceId}`, { token: admin, body: { status: 'suspended' } });
    assert.equal((await call('POST', '/auth/refresh', { cookie: session.cookie, csrf: true })).status, 401);
    const blocked = await login('owner@other.test');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.json.error.code, 'PRACTICE_SUSPENDED');
    await call('PATCH', `/api/platform/practices/${B.practiceId}`, { token: admin, body: { status: 'active' } });
    assert.equal((await login('owner@other.test')).status, 200);
  });

  it('operator actions are logged, with ids only', async () => {
    const rows = await sql<any[]>((q) => q.query('SELECT action, details::text AS d FROM platform_audit'));
    assert.ok(rows.some((r) => r.action === 'PRACTICE_CREATED'));
    assert.ok(!rows.some((r) => /@|password|token/i.test(r.d)), 'no emails, passwords or tokens in the log');
    await assert.rejects(sql((q) => q.query("UPDATE platform_audit SET action = 'X'")), /append-only/);
  });

  it('a second platform admin can be invited by the first', async () => {
    const admin = (await login('admin@plenire.test')).json.accessToken;
    const inv = await call('POST', '/api/platform/admins', { token: admin, body: { email: 'ops@plenire.test', name: 'Ops Person' } });
    assert.equal(inv.status, 201);
    const accepted = await call('POST', '/auth/accept-invite', { body: { token: tokenOf(inv.json.inviteLink), password: STRONG } });
    assert.equal(accepted.json.user.role, 'platform_admin');
    assert.equal(adminId.length > 10, true);
  });

  // ───────────── a practice owner running their own team ─────────────
  it('owner-only team management; front desk is refused', async () => {
    const fd = (await login('tracy@lakeside.test', 'Violet-Anchor-Meadow-81').then((r) => (r.status === 200 ? r : login('tracy@lakeside.test')))).json.accessToken;
    assert.equal((await call('GET', '/api/staff', { token: fd })).status, 403);
    assert.equal((await call('POST', '/api/staff/invite', { token: fd, body: { email: 'z@z.test', name: 'Z', role: 'owner' } })).status, 403);
    assert.equal((await call('POST', '/api/providers', { token: fd, body: { name: 'Dr. Who', initials: 'DW' } })).status, 403);
  });

  it('cannot lock yourself out, cannot remove the last owner, switching someone off ends their sessions', async () => {
    const o = await login('owner@other.test');
    const staff = (await call('GET', '/api/staff', { token: o.json.accessToken })).json;
    const me = staff.find((s: any) => s.email === 'owner@other.test');
    assert.equal((await call('PATCH', `/api/staff/${me.id}`, { token: o.json.accessToken, body: { active: false } })).json.error.code, 'CANNOT_MODIFY_SELF');
    assert.equal((await call('PATCH', `/api/staff/${me.id}`, { token: o.json.accessToken, body: { role: 'front_desk' } })).json.error.code, 'CANNOT_MODIFY_SELF');

    const inv = await call('POST', '/api/staff/invite', { token: o.json.accessToken, body: { email: 'second.owner@other.test', name: 'Second Owner', role: 'owner' } });
    const accepted = await call('POST', '/auth/accept-invite', { body: { token: tokenOf(inv.json.inviteLink), password: STRONG } });
    // the second owner can't remove the first AND leave nobody: demote first owner is allowed only while another owner remains
    const secondId = accepted.json.user.id;
    assert.equal((await call('PATCH', `/api/staff/${me.id}`, { token: accepted.json.accessToken, body: { active: false } })).status, 200);
    assert.equal((await call('POST', '/auth/refresh', { cookie: o.cookie, csrf: true })).status, 401, 'removed owner is signed out');
    const lastTry = await call('PATCH', `/api/staff/${secondId}`, { token: accepted.json.accessToken, body: { role: 'front_desk' } });
    assert.equal(lastTry.json.error.code, 'CANNOT_MODIFY_SELF');
    assert.equal((await login('owner@other.test')).status, 403, 'disabled owner cannot sign in');
    const re = await call('PATCH', `/api/staff/${me.id}`, { token: accepted.json.accessToken, body: { active: true } });
    assert.equal(re.status, 200);
    assert.equal((await login('owner@other.test')).status, 200, 're-enabled');
  });

  it('seat limit and global email uniqueness are enforced', async () => {
    const admin = (await login('admin@plenire.test')).json.accessToken;
    const made = await call('POST', '/api/platform/practices', { token: admin, body: { name: 'Tiny Clinic', phone: '5550199', timezone: 'America/Chicago', ownerName: 'Tina Tiny', ownerEmail: 'tina@tiny.test', staffLimit: 2 } });
    const owner = await call('POST', '/auth/accept-invite', { body: { token: tokenOf(made.json.inviteLink), password: STRONG } });
    const t = owner.json.accessToken;
    assert.equal((await call('POST', '/api/staff/invite', { token: t, body: { email: 'one@tiny.test', name: 'One', role: 'front_desk' } })).status, 201);
    const over = await call('POST', '/api/staff/invite', { token: t, body: { email: 'two@tiny.test', name: 'Two', role: 'front_desk' } });
    assert.equal(over.status, 409);
    assert.equal(over.json.error.code, 'STAFF_LIMIT');
    const dup = await call('POST', '/api/staff/invite', { token: (await login('mensah@lakeside.test')).json.accessToken, body: { email: 'tina@tiny.test', name: 'Dup', role: 'front_desk' } });
    assert.equal(dup.json.error.code, 'EMAIL_IN_USE');
  });

  it('an owner sees only their own team, never another practice\'s', async () => {
    const a = (await call('GET', '/api/staff', { token: (await login('mensah@lakeside.test')).json.accessToken })).json.map((s: any) => s.email);
    assert.ok(a.includes('tracy@lakeside.test'));
    assert.ok(!a.some((e: string) => e.endsWith('@other.test') || e.endsWith('@riverbend.test')));
  });

  it('owners add and edit their own providers', async () => {
    const t = (await login('mensah@lakeside.test')).json.accessToken;
    const add = await call('POST', '/api/providers', { token: t, body: { name: 'Dr. Lee', initials: 'jl', chair: 'Op 5', title: 'Orthodontics' } });
    assert.equal(add.status, 201);
    assert.equal((await call('PATCH', `/api/providers/${add.json.providerId}`, { token: t, body: { chair: 'Op 6' } })).status, 200);
    const list = (await call('GET', '/api/providers', { token: t })).json;
    assert.deepEqual(list.filter((p: any) => p.name === 'Dr. Lee').map((p: any) => [p.initials, p.chair]), [['JL', 'Op 6']]);
    const bProviders = (await call('GET', '/api/providers', { token: (await login('owner@other.test')).json.accessToken })).json;
    assert.ok(!bProviders.some((p: any) => p.name === 'Dr. Lee'));
  });

  it('sign-in, invitation and reset events land in the practice audit chain, which stays intact', async () => {
    const t = (await login('mensah@lakeside.test')).json.accessToken;
    const log = (await call('GET', '/api/audit', { token: t })).json.map((e: any) => e.action);
    for (const a of ['LOGIN', 'LOGIN_FAILED', 'STAFF_INVITED', 'INVITE_ACCEPTED', 'PASSWORD_RESET', 'PASSWORD_CHANGED']) assert.ok(log.includes(a), a);
    assert.deepEqual((await call('GET', '/api/audit/verify', { token: t })).json, { intact: true, firstBrokenSeq: null });
    const details = JSON.stringify((await call('GET', '/api/audit', { token: t })).json.map((e: any) => e.details));
    assert.ok(!/@|assword|Orange-Falcon|token/i.test(details), 'no emails, passwords or tokens in the audit details');
  });

  // helper
  async function seedStaff(email: string, name: string, status: 'active' | 'disabled' = 'active') {
    await sql(async (q) => {
      const [s] = await q.query<{ id: string }>("INSERT INTO staff (practice_id, email, name, role, status, accepted_at) VALUES ($1,$2,$3,'front_desk',$4, now()) RETURNING id", [A.practiceId, email, name, status]);
      await q.query("INSERT INTO credentials (principal_id, principal_type, password_hash) VALUES ($1,'staff',$2)", [s.id, await hashPassword(DEMO_PASSWORD)]);
    });
  }
});

describe('startup safety checks', () => {
  const prod = { NODE_ENV: 'production', DATABASE_URL: 'postgres://x', AUTH_JWT_SECRET: 'x'.repeat(40), APP_URL: 'https://app.example.com', EMAIL_PROVIDER: 'ses', EXPOSE_INVITE_LINKS: 'false', ENABLE_SIMULATOR: 'false', SCRYPT_LOG_N: '15' };
  it('a correct production setup is accepted', () => assert.equal(loadConfig(prod).AUTH_MODE, 'local'));
  it('refuses unsafe production settings, each with a clear message', () => {
    assert.throws(() => loadConfig({ ...prod, EXPOSE_INVITE_LINKS: 'true' }), /EXPOSE_INVITE_LINKS/);
    assert.throws(() => loadConfig({ ...prod, EMAIL_PROVIDER: 'console' }), /EMAIL_PROVIDER/);
    assert.throws(() => loadConfig({ ...prod, AUTH_JWT_SECRET: undefined }), /AUTH_JWT_SECRET/);
    assert.throws(() => loadConfig({ ...prod, APP_URL: 'http://app.example.com' }), /https/);
    assert.throws(() => loadConfig({ ...prod, ENABLE_SIMULATOR: 'true' }), /ENABLE_SIMULATOR/);
    assert.throws(() => loadConfig({ ...prod, DATABASE_URL: undefined }), /DATABASE_URL/);
    assert.throws(() => loadConfig({ ...prod, SCRYPT_LOG_N: '12' }), /SCRYPT_LOG_N/);
  });
  it('cognito mode needs its settings; development defaults are friendly', () => {
    assert.throws(() => loadConfig({ AUTH_MODE: 'cognito' }), /COGNITO_REGION/);
    assert.equal(loadConfig({}).EXPOSE_INVITE_LINKS, 'true');
  });
});
