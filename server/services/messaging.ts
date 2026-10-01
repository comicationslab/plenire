import { detectEPHI } from '../../shared/phi';
import type { Db, Queryable } from '../db/adapter';
import { AppError } from './errors';
import { SYSTEM, type Ctx, audit } from './audit';

/** The thing that actually sends a text. Swapped for AWS End User Messaging in the AWS phase. */
export interface MessageProvider {
  send(to: string, body: string): Promise<void>;
}

/** Development provider: prints a masked number only, never the message body. */
export const consoleProvider: MessageProvider = {
  async send(to) {
    console.log(`[sms:dev] would send a text to ***${to.slice(-4)}`);
  },
};

/** Queue a text inside the caller's transaction (outbox pattern). Blocks health wording and opted-out patients. */
export async function queueMessage(q: Queryable, ctx: Ctx, patientId: string, body: string) {
  const phi = detectEPHI(body);
  if (phi.hasEPHI) throw new AppError(422, 'PHI_IN_MESSAGE', `Message mentions health details: ${phi.detectedTerms.join(', ')}`);
  const [p] = await q.query<{ phone: string | null; sms_consent: boolean; sms_opt_out_at: string | null }>(
    'SELECT phone, sms_consent, sms_opt_out_at FROM patients WHERE id = $1',
    [patientId],
  );
  if (!p) throw new AppError(404, 'PATIENT_NOT_FOUND');
  if (!p.phone || !p.sms_consent || p.sms_opt_out_at) throw new AppError(422, 'NO_SMS_CONSENT');
  await q.query("INSERT INTO messages (practice_id, patient_id, direction, body, status) VALUES ($1,$2,'out',$3,'queued')", [
    ctx.practiceId, patientId, body,
  ]);
}

/** A reply to someone who just texted STOP/HELP/START is allowed even though they have no active consent. */
export async function queueReply(q: Queryable, ctx: Ctx, patientId: string, body: string) {
  await q.query("INSERT INTO messages (practice_id, patient_id, direction, body, status) VALUES ($1,$2,'out',$3,'queued')", [
    ctx.practiceId, patientId, body,
  ]);
}

/**
 * Sends everything queued for ONE practice. Run after the business transaction commits, and on a schedule.
 * FOR UPDATE SKIP LOCKED lets several workers run at once without double-sending.
 */
export async function dispatchOutbox(db: Db, practiceId: string, provider: MessageProvider, batch = 50): Promise<{ sent: number; failed: number }> {
  return db.tenant(practiceId, async (q) => {
    const rows = await q.query<{ id: string; body: string; phone: string | null }>(
      `SELECT m.id, m.body, p.phone FROM messages m JOIN patients p ON p.practice_id = m.practice_id AND p.id = m.patient_id
        WHERE m.status = 'queued' ORDER BY m.created_at LIMIT $1 FOR UPDATE OF m SKIP LOCKED`,
      [batch],
    );
    let sent = 0, failed = 0;
    for (const m of rows) {
      try {
        if (!m.phone) throw new Error('no phone');
        await provider.send(m.phone, m.body);
        await q.query("UPDATE messages SET status='sent', sent_at=now(), attempts=attempts+1 WHERE id=$1", [m.id]);
        sent++;
      } catch {
        await q.query("UPDATE messages SET status='failed', attempts=attempts+1 WHERE id=$1", [m.id]);
        failed++;
      }
    }
    if (rows.length) await audit(q, SYSTEM(practiceId), 'OUTBOX_DISPATCHED', { sent, failed });
    return { sent, failed };
  });
}
