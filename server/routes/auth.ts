import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { LocalTokens } from '../auth/tokens';
import type { Db } from '../db/adapter';
import { rateLimit } from '../middleware/rateLimit';
import { audit } from '../services/audit';
import { acceptInvitation, login, logout, peekInvitation, refresh, startPasswordReset, type AuthSettings, type Principal, type SessionResult } from '../services/auth';
import { inviteHours, platformAudit } from '../services/accounts';
import { resetEmail, type EmailProvider } from '../services/email';
import { AppError } from '../services/errors';

export interface AuthRouteDeps {
  db: Db;
  tokens: LocalTokens;
  email: EmailProvider;
  cfg: { APP_URL: string; EXPOSE_INVITE_LINKS: 'true' | 'false'; TRUST_PROXY: 'true' | 'false'; ACCESS_TOKEN_TTL_SECONDS: number; AUTH_RATE_LIMIT_PER_MINUTE: number; SESSION_HOURS: number; SESSION_IDLE_MINUTES: number; production: boolean };
}

const COOKIE = 'plenire_rt';
export const emailField = z.string().trim().toLowerCase().email().max(200);
const parse = <T extends z.ZodTypeAny>(s: T, d: unknown): z.infer<T> => s.parse(d);

export const inviteLink = (appUrl: string, path: 'accept-invite' | 'reset-password', token: string) => `${appUrl}/${path}?token=${encodeURIComponent(token)}`;

/** Public sign-in endpoints. Refresh tokens live in an HttpOnly cookie that scripts cannot read. */
export function authRoutes(d: AuthRouteDeps) {
  const r = new Hono();
  const settings: AuthSettings = { sessionHours: d.cfg.SESSION_HOURS, idleMinutes: d.cfg.SESSION_IDLE_MINUTES };
  const trust = d.cfg.TRUST_PROXY === 'true';
  const strict = rateLimit({ max: d.cfg.AUTH_RATE_LIMIT_PER_MINUTE, windowMs: 60_000, trustProxy: trust });

  /** Records the event in the practice's tamper-evident log (or the operator log). Never blocks sign-in if logging fails. */
  const record = async (p: Principal, action: string) => {
    try {
      if (p.type === 'platform') await d.db.platform((q) => platformAudit(q, p.id, action));
      else await d.db.tenant(p.practiceId!, (q) => audit(q, { practiceId: p.practiceId!, actorId: p.id, role: p.role as never }, action));
    } catch { console.error('[auth] could not write audit entry'); }
  };

  const respond = async (c: Context, res: Extract<SessionResult, { ok: true }>) => {
    const accessToken = await d.tokens.issue({ staffId: res.principal.id, practiceId: res.principal.practiceId, role: res.principal.role, sid: res.sid }, d.cfg.ACCESS_TOKEN_TTL_SECONDS);
    setCookie(c, COOKIE, res.refreshToken, { httpOnly: true, sameSite: 'Strict', secure: d.cfg.production, path: '/auth', maxAge: d.cfg.SESSION_HOURS * 3600 });
    const p = res.principal;
    return c.json({ accessToken, expiresIn: d.cfg.ACCESS_TOKEN_TTL_SECONDS, user: { id: p.id, name: p.name, email: p.email, role: p.role, practiceId: p.practiceId, practiceName: p.practiceName } });
  };

  const fail = (res: Extract<SessionResult, { ok: false }>): never => {
    switch (res.reason) {
      case 'locked': throw new AppError(429, 'ACCOUNT_LOCKED', 'Too many wrong attempts. Try again in 15 minutes, or reset your password.');
      case 'disabled': throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been turned off. Ask your practice owner.');
      case 'suspended': throw new AppError(403, 'PRACTICE_SUSPENDED', "This practice's access is paused. Please contact Plenire support.");
      default: throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
    }
  };

  // Browsers only send this custom header from our own site, which blocks cross-site requests that ride the cookie.
  const csrf = (c: Context) => {
    if (c.req.header('x-plenire-csrf') !== '1') throw new AppError(403, 'CSRF', 'Missing request header');
  };

  r.post('/login', strict, async (c) => {
    const b = parse(z.object({ email: emailField, password: z.string().min(1).max(256) }), await c.req.json());
    const res = await login(d.db, settings, b.email, b.password);
    if (!res.ok) {
      if (res.principal) await record(res.principal, res.reason === 'invalid' ? 'LOGIN_FAILED' : res.reason === 'locked' ? 'LOGIN_LOCKED' : 'LOGIN_BLOCKED');
      fail(res);
    }
    if (res.ok) { await record(res.principal, 'LOGIN'); return respond(c, res); }
  });

  r.post('/refresh', rateLimit({ max: Math.max(60, d.cfg.AUTH_RATE_LIMIT_PER_MINUTE * 6), windowMs: 60_000, trustProxy: trust }), async (c) => {
    csrf(c);
    const raw = getCookie(c, COOKIE);
    if (!raw) throw new AppError(401, 'NO_SESSION', 'Please sign in');
    const res = await refresh(d.db, settings, raw);
    if (!res.ok) {
      if (res.reason !== 'race') deleteCookie(c, COOKIE, { path: '/auth' });
      throw new AppError(401, 'SESSION_ENDED', 'Your session has ended. Please sign in again.');
    }
    return respond(c, res);
  });

  r.post('/logout', async (c) => {
    csrf(c);
    const raw = getCookie(c, COOKIE);
    if (raw) {
      const who = await logout(d.db, raw);
      deleteCookie(c, COOKIE, { path: '/auth' });
      if (who?.practiceId) await d.db.tenant(who.practiceId, (q) => audit(q, { practiceId: who.practiceId!, actorId: who.principalId, role: 'system' }, 'LOGOUT')).catch(() => {});
    }
    return c.json({ ok: true });
  });

  r.get('/invitations/:token', strict, async (c) => c.json(await peekInvitation(d.db, c.req.param('token'))));

  const accept = (action: string) => async (c: Context) => {
    const b = parse(z.object({ token: z.string().min(20).max(100), password: z.string().min(1).max(256), name: z.string().trim().min(1).max(120).optional() }), await c.req.json());
    const res = await acceptInvitation(d.db, settings, b.token, b.password, b.name);
    if (!res.ok) return fail(res);
    await record(res.principal, res.kind === 'password_reset' ? 'PASSWORD_RESET' : action);
    return respond(c, res);
  };
  r.post('/accept-invite', strict, accept('INVITE_ACCEPTED'));
  r.post('/reset', strict, accept('PASSWORD_RESET'));

  r.post('/forgot', rateLimit({ max: Math.max(5, Math.floor(d.cfg.AUTH_RATE_LIMIT_PER_MINUTE / 2)), windowMs: 60_000, trustProxy: trust }), async (c) => {
    const { email } = parse(z.object({ email: emailField }), await c.req.json());
    const started = await startPasswordReset(d.db, email);
    let link: string | undefined;
    if (started) {
      link = inviteLink(d.cfg.APP_URL, 'reset-password', started.token);
      await d.email.send(resetEmail(started.principal.email, link)).catch(() => console.error('[email] could not send reset email'));
      await record(started.principal, 'PASSWORD_RESET_REQUESTED');
    }
    // The answer is identical whether or not the email exists. (Development can show the link for convenience.)
    return c.json({ ok: true, ...(d.cfg.EXPOSE_INVITE_LINKS === 'true' && link ? { devLink: link } : {}) }, 202);
  });

  return r;
}

export { inviteHours };
