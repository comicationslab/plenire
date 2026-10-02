import { Hono } from 'hono';
import { z } from 'zod';
import { ROLES } from '../auth/tokens';
import type { Db } from '../db/adapter';
import type { Env } from '../middleware/auth';
import { addProvider, inviteHours, inviteStaff, listStaff, resendInvite, updateProvider, updateStaff } from '../services/accounts';
import { changePassword } from '../services/auth';
import { inviteEmail, type EmailProvider } from '../services/email';
import { AppError } from '../services/errors';
import { emailField, inviteLink } from './auth';

const uuid = z.string().uuid();
const parse = <T extends z.ZodTypeAny>(s: T, d: unknown): z.infer<T> => s.parse(d);

export interface TeamDeps { db: Db; email: EmailProvider; appUrl: string; exposeLinks: boolean }

/** A practice owner managing their own team and providers, plus anyone changing their own password. Mounted under /api. */
export function teamRoutes(d: TeamDeps) {
  const r = new Hono<Env>();
  const ownerOnly = async (c: { get: (k: 'role') => string }) => {
    if (c.get('role') !== 'owner') throw new AppError(403, 'FORBIDDEN', 'Only owners can do this');
  };
  const run = <T>(c: { get: (k: 'ctx') => Env['Variables']['ctx'] }, fn: Parameters<Db['tenant']>[1] extends (q: infer Q) => unknown ? (q: Q, ctx: Env['Variables']['ctx']) => Promise<T> : never) =>
    d.db.tenant(c.get('ctx').practiceId, (q) => fn(q, c.get('ctx')));
  const practiceName = (c: { get: (k: 'ctx') => Env['Variables']['ctx'] }) =>
    run(c, async (q, ctx) => (await q.query<{ name: string }>('SELECT name FROM practices WHERE id = $1', [ctx.practiceId]))[0].name);
  const sendInvite = async (c: { get: (k: 'ctx') => Env['Variables']['ctx'] }, email: string, token: string) => {
    const l = inviteLink(d.appUrl, 'accept-invite', token);
    const emailSent = await d.email.send(inviteEmail(email, await practiceName(c), l, inviteHours)).then(() => true, () => false);
    return { emailSent, ...(d.exposeLinks ? { inviteLink: l } : {}) };
  };

  r.get('/staff', async (c) => { await ownerOnly(c); return c.json(await run(c, (q) => listStaff(q))); });

  r.post('/staff/invite', async (c) => {
    await ownerOnly(c);
    const b = parse(z.object({ email: emailField, name: z.string().trim().min(1).max(120), role: z.enum(ROLES) }), await c.req.json());
    const out = await run(c, (q, ctx) => inviteStaff(q, ctx, b));
    return c.json({ staffId: out.staffId, ...(await sendInvite(c, b.email, out.token)) }, 201);
  });

  r.post('/staff/:id/resend', async (c) => {
    await ownerOnly(c);
    const out = await run(c, (q, ctx) => resendInvite(q, ctx, parse(uuid, c.req.param('id'))));
    return c.json(await sendInvite(c, out.email, out.token), 201);
  });

  r.patch('/staff/:id', async (c) => {
    await ownerOnly(c);
    const b = parse(z.object({ role: z.enum(ROLES).optional(), active: z.boolean().optional() }), await c.req.json());
    await run(c, (q, ctx) => updateStaff(q, ctx, parse(uuid, c.req.param('id')), b));
    return c.json({ ok: true });
  });

  r.post('/providers', async (c) => {
    await ownerOnly(c);
    const b = parse(z.object({ name: z.string().trim().min(1).max(80), initials: z.string().trim().min(1).max(4), chair: z.string().trim().max(20).nullish(), title: z.string().trim().max(80).nullish() }), await c.req.json());
    return c.json({ providerId: await run(c, (q, ctx) => addProvider(q, ctx, { name: b.name, initials: b.initials.toUpperCase(), chair: b.chair || null, title: b.title || null })) }, 201);
  });

  r.patch('/providers/:id', async (c) => {
    await ownerOnly(c);
    const b = parse(z.object({ name: z.string().trim().min(1).max(80).optional(), initials: z.string().trim().min(1).max(4).optional(), chair: z.string().trim().max(20).nullable().optional(), title: z.string().trim().max(80).nullable().optional(), active: z.boolean().optional() }), await c.req.json());
    await run(c, (q, ctx) => updateProvider(q, ctx, parse(uuid, c.req.param('id')), b));
    return c.json({ ok: true });
  });

  r.post('/account/password', async (c) => {
    const b = parse(z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(1).max(256) }), await c.req.json());
    const ctx = c.get('ctx');
    const [me] = await run(c, (q) => q.query<{ email: string; name: string }>('SELECT email, name FROM staff WHERE id = $1', [ctx.actorId]));
    if (!me) throw new AppError(404, 'NOT_FOUND');
    await changePassword(d.db, { id: ctx.actorId!, type: 'staff', ...me }, c.get('claims').sid, b.currentPassword, b.newPassword);
    await run(c, (q, x) => import('../services/audit').then((m) => m.audit(q, x, 'PASSWORD_CHANGED')));
    return c.json({ ok: true });
  });

  return r;
}
