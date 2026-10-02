import { createMiddleware } from 'hono/factory';
import type { Claims, Role, Verifier } from '../auth/tokens';
import { AppError } from '../services/errors';
import type { Ctx } from '../services/audit';

export type Env = { Variables: { claims: Claims; ctx: Ctx; role: Role } };

/** Reads and checks the sign-in token. Everything after this knows who is calling. */
export const authenticate = (verifier: Verifier) =>
  createMiddleware<Env>(async (c, next) => {
    const h = c.req.header('authorization');
    if (!h?.startsWith('Bearer ')) throw new AppError(401, 'UNAUTHENTICATED');
    try {
      c.set('claims', await verifier.verify(h.slice(7)));
    } catch {
      throw new AppError(401, 'INVALID_TOKEN');
    }
    await next();
  });

/** Practice screens: platform admins are turned away (they have no practice and no patient access). */
export const practiceUsersOnly = createMiddleware<Env>(async (c, next) => {
  const claims = c.get('claims');
  if (claims.role === 'platform_admin' || !claims.practiceId) throw new AppError(403, 'FORBIDDEN', 'Platform admins cannot open practice data');
  c.set('ctx', { practiceId: claims.practiceId, actorId: claims.staffId, role: claims.role });
  c.set('role', claims.role);
  await next();
});

export const platformAdminsOnly = createMiddleware<Env>(async (c, next) => {
  if (c.get('claims').role !== 'platform_admin') throw new AppError(403, 'FORBIDDEN', 'Platform admins only');
  await next();
});
