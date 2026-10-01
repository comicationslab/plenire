import type { Queryable } from '../db/adapter';
import type { Role } from '../auth/tokens';

export interface Ctx {
  practiceId: string;
  /** null = the system itself (scheduled jobs, inbound texts) */
  actorId: string | null;
  role: Role | 'system';
}

export const SYSTEM = (practiceId: string): Ctx => ({ practiceId, actorId: null, role: 'system' });

/**
 * Appends a tamper-evident entry. `details` must contain ids/counts only: never names, phone numbers or message text.
 * The database trigger assigns sequence, time and hash, so callers cannot forge them.
 */
export async function audit(q: Queryable, ctx: Ctx, action: string, details: Record<string, unknown> = {}) {
  await q.query(
    'INSERT INTO audit_log (practice_id, actor_id, actor_role, action, details, seq, at, prev_hash, hash) VALUES ($1,$2,$3,$4,$5,0,now(),\'\',\'\')',
    [ctx.practiceId, ctx.actorId, ctx.role, action, JSON.stringify(details)],
  );
}
