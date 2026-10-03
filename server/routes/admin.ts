import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/adapter';
import { authenticate, platformAdminsOnly, type Env } from '../middleware/auth';
import type { Verifier } from '../auth/tokens';
import { changePassword, confirmPassword } from '../services/auth';
import { inviteAdmin, inviteHours, listAdmins, listPractices, provisionPractice, reinviteOwner, removePractice, restorePractice, updatePractice } from '../services/accounts';
import { adminInviteEmail, inviteEmail, type EmailProvider } from '../services/email';
import { AppError } from '../services/errors';
import { emailField, inviteLink } from './auth';

const uuid = z.string().uuid();
const parse = <T extends z.ZodTypeAny>(s: T, d: unknown): z.infer<T> => s.parse(d);

export interface AdminDeps { db: Db; verifier: Verifier; email: EmailProvider; appUrl: string; exposeLinks: boolean }

/** The operator console. Everything here runs as the "platform" database role, which cannot read any patient data. */
export function adminRoutes(d: AdminDeps) {
  const r = new Hono<Env>();
  r.use('*', authenticate(d.verifier), platformAdminsOnly);
  const link = (token: string, path: 'accept-invite' | 'reset-password' = 'accept-invite') => inviteLink(d.appUrl, path, token);
  const sendSafely = async (mail: Parameters<EmailProvider['send']>[0]) => d.email.send(mail).then(() => true, () => false);

  r.get('/practices', async (c) => c.json(await listPractices(d.db)));

  r.post('/practices', async (c) => {
    const b = parse(z.object({
      name: z.string().trim().min(2).max(120), phone: z.string().trim().min(7).max(30), address: z.string().trim().max(200).nullish(),
      timezone: z.string().trim().min(3).max(60), ownerName: z.string().trim().min(1).max(120), ownerEmail: emailField,
      staffLimit: z.number().int().min(1).max(500).optional(), plan: z.string().trim().max(40).optional(),
    }), await c.req.json());
    const out = await provisionPractice(d.db, c.get('claims').staffId, b);
    const l = link(out.token);
    const emailSent = await sendSafely(inviteEmail(b.ownerEmail, b.name, l, inviteHours));
    return c.json({ practiceId: out.practiceId, ownerEmail: b.ownerEmail, emailSent, ...(d.exposeLinks ? { inviteLink: l } : {}) }, 201);
  });

  r.patch('/practices/:id', async (c) => {
    const b = parse(z.object({ status: z.enum(['active', 'suspended']).optional(), plan: z.string().trim().max(40).optional(), staffLimit: z.number().int().min(1).max(500).optional() }), await c.req.json());
    await updatePractice(d.db, c.get('claims').staffId, parse(uuid, c.req.param('id')), b);
    return c.json({ ok: true });
  });

  // Removing a clinic needs the signed-in admin's own password, checked here on the server.
  r.post('/practices/:id/remove', async (c) => {
    const b = parse(z.object({ password: z.string().max(256).optional() }), await c.req.json().catch(() => ({})));
    await confirmPassword(d.db, c.get('claims').staffId, b.password);
    await removePractice(d.db, c.get('claims').staffId, parse(uuid, c.req.param('id')));
    return c.json({ ok: true });
  });

  r.post('/practices/:id/restore', async (c) => {
    await restorePractice(d.db, c.get('claims').staffId, parse(uuid, c.req.param('id')));
    return c.json({ ok: true });
  });

  r.post('/practices/:id/owner-invite', async (c) => {
    const b = parse(z.object({ email: emailField.optional(), name: z.string().trim().min(1).max(120).optional() }), await c.req.json().catch(() => ({})));
    const id = parse(uuid, c.req.param('id'));
    const out = await reinviteOwner(d.db, c.get('claims').staffId, id, b.email, b.name);
    const l = link(out.token);
    const [{ name }] = (await listPractices(d.db)).filter((p: any) => p.id === id) as { name: string }[];
    const emailSent = await sendSafely(inviteEmail(out.email, name, l, inviteHours));
    return c.json({ email: out.email, emailSent, ...(d.exposeLinks ? { inviteLink: l } : {}) }, 201);
  });

  r.get('/admins', async (c) => c.json(await listAdmins(d.db)));
  r.post('/admins', async (c) => {
    const b = parse(z.object({ email: emailField, name: z.string().trim().min(1).max(120) }), await c.req.json());
    const out = await inviteAdmin(d.db, c.get('claims').staffId, b);
    const l = link(out.token);
    const emailSent = await sendSafely(adminInviteEmail(b.email, l, inviteHours));
    return c.json({ adminId: out.adminId, emailSent, ...(d.exposeLinks ? { inviteLink: l } : {}) }, 201);
  });

  r.post('/account/password', async (c) => {
    const b = parse(z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(1).max(256) }), await c.req.json());
    const claims = c.get('claims');
    const [me] = (await d.db.platform((q) => q.query<{ email: string; name: string }>('SELECT email, name FROM platform_admins WHERE id = $1', [claims.staffId])));
    if (!me) throw new AppError(404, 'NOT_FOUND');
    await changePassword(d.db, { id: claims.staffId, type: 'platform', ...me }, claims.sid, b.currentPassword, b.newPassword);
    return c.json({ ok: true });
  });

  return r;
}
