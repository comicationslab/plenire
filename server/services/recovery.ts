import type { Db, Queryable } from '../db/adapter';
import { AppError } from './errors';
import { SYSTEM, audit, type Ctx } from './audit';
import { queueMessage, queueReply } from './messaging';

export type AppointmentStatus = 'scheduled' | 'arrived' | 'completed' | 'noshow' | 'cancelled';

// ───────────── appointments → openings ─────────────

/** Changes an appointment's status. A no-show or cancellation automatically creates ONE recovery opening. */
export async function setAppointmentStatus(q: Queryable, ctx: Ctx, appointmentId: string, status: AppointmentStatus) {
  const [appt] = await q.query<any>(
    `UPDATE appointments SET status = $2, thanked = thanked OR $2 = 'completed' WHERE id = $1
      RETURNING id, provider_id, patient_id, starts_at, duration_min, treatment`,
    [appointmentId, status],
  );
  if (!appt) throw new AppError(404, 'APPOINTMENT_NOT_FOUND');
  await audit(q, ctx, 'APPT_STATUS', { appointmentId, status });

  let openingId: string | null = null;
  if (status === 'noshow' || status === 'cancelled') {
    const [o] = await q.query<{ id: string }>(
      `INSERT INTO openings (practice_id, appointment_id, provider_id, original_patient_id, starts_at, duration_min, kind, treatment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (appointment_id) DO NOTHING RETURNING id`,
      [ctx.practiceId, appt.id, appt.provider_id, appt.patient_id, appt.starts_at, appt.duration_min,
       status === 'noshow' ? 'no-show' : 'cancellation', appt.treatment],
    );
    openingId = o?.id ?? null;
    if (openingId) await audit(q, ctx, 'OPENING_CREATED', { openingId, kind: status });
  }
  if (status !== 'noshow' && status !== 'cancelled') {
    // Undo: the patient turned up after all, so any still-unfilled opening for this visit is closed.
    const closed = await q.query<{ id: string }>(
      "UPDATE openings SET status = 'closed' WHERE appointment_id = $1 AND status IN ('open','offered') RETURNING id",
      [appointmentId],
    );
    if (closed.length) {
      await q.query("UPDATE offers SET status = 'withdrawn', responded_at = now() WHERE opening_id = $1 AND status = 'sent'", [closed[0].id]);
      await audit(q, ctx, 'OPENING_CLOSED', { openingId: closed[0].id, reason: 'appointment restored' });
    }
  }
  return { appointmentId, status, openingId };
}

// ───────────── offers ─────────────

export interface SendOffersOptions { limit?: number; ttlMinutes?: number }

/**
 * Ranks the waitlist (treatment fit, preferred provider, urgency, time waiting), skips anyone who has not
 * consented or has opted out, and queues one offer text each. Offers expire on a database clock.
 */
export async function sendOffers(q: Queryable, ctx: Ctx, openingId: string, opts: SendOffersOptions = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 3, 1), 10);
  const ttl = Math.min(Math.max(opts.ttlMinutes ?? 15, 1), 240);

  const [opening] = await q.query<any>(
    `SELECT o.*, p.name AS practice_name, p.phone AS practice_phone,
            to_char(o.starts_at AT TIME ZONE p.timezone, 'FMHH12:MI AM') AS local_time
       FROM openings o JOIN practices p ON p.id = o.practice_id WHERE o.id = $1 FOR UPDATE OF o`,
    [openingId],
  );
  if (!opening) throw new AppError(404, 'OPENING_NOT_FOUND');
  if (opening.status === 'filled' || opening.status === 'closed') throw new AppError(409, 'OPENING_NOT_AVAILABLE');

  const candidates = await q.query<{ patient_id: string; name: string }>(
    `SELECT pt.id AS patient_id, pt.name
       FROM waitlist_entries w
       JOIN patients pt ON pt.practice_id = w.practice_id AND pt.id = w.patient_id
      WHERE pt.sms_consent AND pt.sms_opt_out_at IS NULL AND pt.phone IS NOT NULL
        AND pt.id IS DISTINCT FROM $2::uuid
        AND NOT EXISTS (SELECT 1 FROM offers x WHERE x.opening_id = $1 AND x.patient_id = pt.id)
      ORDER BY
        (CASE WHEN EXISTS (SELECT 1 FROM unnest(w.treatments) t WHERE lower($3) LIKE '%' || lower(t) || '%') THEN 2 ELSE 0 END)
        + (CASE WHEN w.preferred_provider_id = $4::uuid THEN 1 ELSE 0 END) DESC,
        CASE w.urgency WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
        w.created_at
      LIMIT $5`,
    [openingId, opening.original_patient_id, opening.treatment, opening.provider_id, limit],
  );

  for (const c of candidates) {
    await q.query(
      `INSERT INTO offers (practice_id, opening_id, patient_id, expires_at) VALUES ($1,$2,$3, now() + make_interval(mins => $4))`,
      [ctx.practiceId, openingId, c.patient_id, ttl],
    );
    const first = c.name.split(' ')[0];
    await queueMessage(
      q, ctx, c.patient_id,
      `Hi ${first}, this is ${opening.practice_name}. An opening just came up today at ${opening.local_time}. Reply YES to book or NO to pass. Reply STOP to opt out.`,
    );
  }
  if (candidates.length) await q.query("UPDATE openings SET status = 'offered' WHERE id = $1 AND status = 'open'", [openingId]);
  await audit(q, ctx, 'OFFERS_SENT', { openingId, count: candidates.length, ttlMinutes: ttl });
  return { openingId, offered: candidates.length };
}

export type AcceptResult =
  | { filled: true; openingId: string; appointmentId: string; valueCents: number }
  | { filled: false; reason: 'taken' | 'expired' | 'not_available' };

/**
 * First valid YES wins. The opening row is locked first, so two patients answering at the same moment are
 * handled one after the other: exactly one gets the slot; the other is told it was taken.
 */
export async function acceptOffer(q: Queryable, ctx: Ctx, offerId: string): Promise<AcceptResult> {
  const [ref] = await q.query<{ opening_id: string }>('SELECT opening_id FROM offers WHERE id = $1', [offerId]);
  if (!ref) throw new AppError(404, 'OFFER_NOT_FOUND');

  const [opening] = await q.query<any>('SELECT * FROM openings WHERE id = $1 FOR UPDATE', [ref.opening_id]);
  if (opening.status === 'filled' || opening.status === 'closed') {
    await q.query("UPDATE offers SET status = 'withdrawn', responded_at = now() WHERE id = $1 AND status = 'sent'", [offerId]);
    return { filled: false, reason: opening.status === 'filled' ? 'taken' : 'not_available' };
  }

  const [offer] = await q.query<{ patient_id: string }>(
    `UPDATE offers SET status = 'filled', responded_at = now()
      WHERE id = $1 AND status = 'sent' AND expires_at > now() RETURNING patient_id`,
    [offerId],
  );
  if (!offer) {
    await q.query("UPDATE offers SET status = 'expired' WHERE id = $1 AND status = 'sent' AND expires_at <= now()", [offerId]);
    return { filled: false, reason: 'expired' };
  }

  const [{ value }] = await q.query<{ value: number }>('SELECT estimate_fee_cents($1, $2) AS value', [ctx.practiceId, opening.treatment]);
  await q.query(
    `UPDATE openings SET status = 'filled', filled_by_patient_id = $2, filled_at = now(), value_cents = $3 WHERE id = $1`,
    [opening.id, offer.patient_id, value],
  );
  await q.query("UPDATE offers SET status = 'withdrawn', responded_at = now() WHERE opening_id = $1 AND status = 'sent'", [opening.id]);
  const [appt] = await q.query<{ id: string }>(
    `INSERT INTO appointments (practice_id, patient_id, provider_id, starts_at, duration_min, treatment)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [ctx.practiceId, offer.patient_id, opening.provider_id, opening.starts_at, opening.duration_min, opening.treatment],
  );
  await q.query('DELETE FROM waitlist_entries WHERE patient_id = $1', [offer.patient_id]);

  const [pr] = await q.query<{ name: string; phone: string; t: string }>(
    `SELECT name, phone, to_char($1::timestamptz AT TIME ZONE timezone, 'FMHH12:MI AM') AS t FROM practices WHERE id = $2`,
    [opening.starts_at, ctx.practiceId],
  );
  await queueMessage(q, ctx, offer.patient_id, `You're booked for today at ${pr.t} at ${pr.name}. See you then! Reply STOP to opt out.`);
  await audit(q, ctx, 'SLOT_FILLED', { openingId: opening.id, appointmentId: appt.id, valueCents: value });
  return { filled: true, openingId: opening.id, appointmentId: appt.id, valueCents: value };
}

// ───────────── inbound replies ─────────────

const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const YES_WORDS = new Set(['YES', 'Y', 'SURE', 'BOOK', 'OK', 'OKAY']);
const NO_WORDS = new Set(['NO', 'N', 'PASS']);

export type ReplyOutcome = 'opted_out' | 'opted_in' | 'help' | 'booked' | 'declined' | 'offer_unavailable' | 'needs_staff';

/** Handles a patient's text. Carrier rules (STOP / START / HELP) are honoured immediately and always. */
export async function handleReply(q: Queryable, ctx: Ctx, patientId: string, text: string): Promise<{ outcome: ReplyOutcome }> {
  const [pt] = await q.query<{ name: string; sms_opt_out_at: string | null }>('SELECT name, sms_opt_out_at FROM patients WHERE id = $1', [patientId]);
  if (!pt) throw new AppError(404, 'PATIENT_NOT_FOUND');
  const [practice] = await q.query<{ name: string; phone: string }>('SELECT name, phone FROM practices WHERE id = $1', [ctx.practiceId]);

  await q.query("INSERT INTO messages (practice_id, patient_id, direction, body, status) VALUES ($1,$2,'in',$3,'received')", [ctx.practiceId, patientId, text.slice(0, 1000)]);
  const word = text.trim().split(/\s+/)[0]?.toUpperCase().replace(/[^A-Z]/g, '') ?? '';

  if (STOP_WORDS.has(word)) {
    await q.query("UPDATE patients SET sms_consent = false, sms_opt_out_at = now() WHERE id = $1", [patientId]);
    await q.query("UPDATE offers SET status = 'withdrawn', responded_at = now() WHERE patient_id = $1 AND status = 'sent'", [patientId]);
    await q.query("UPDATE openings o SET status = 'open' WHERE o.status = 'offered' AND NOT EXISTS (SELECT 1 FROM offers x WHERE x.opening_id = o.id AND x.status = 'sent')");
    await queueReply(q, ctx, patientId, `${practice.name}: You are unsubscribed and will get no more texts. Reply START to resume.`);
    await audit(q, ctx, 'TCPA_STOP', { patientId });
    return { outcome: 'opted_out' };
  }
  if (word === 'START' || word === 'UNSTOP') {
    await q.query("UPDATE patients SET sms_consent = true, sms_consent_at = now(), sms_opt_out_at = NULL WHERE id = $1", [patientId]);
    await queueReply(q, ctx, patientId, `${practice.name}: You are subscribed again. Reply STOP to opt out.`);
    await audit(q, ctx, 'TCPA_START', { patientId });
    return { outcome: 'opted_in' };
  }
  if (word === 'HELP') {
    await queueReply(q, ctx, patientId, `${practice.name}: Call us at ${practice.phone} for help. Reply STOP to opt out.`);
    return { outcome: 'help' };
  }
  if (pt.sms_opt_out_at) return { outcome: 'needs_staff' };

  const [live] = await q.query<{ id: string }>(
    "SELECT id FROM offers WHERE patient_id = $1 AND status = 'sent' AND expires_at > now() ORDER BY sent_at DESC LIMIT 1",
    [patientId],
  );
  if (YES_WORDS.has(word)) {
    if (!live) {
      await queueReply(q, ctx, patientId, `${practice.name}: Sorry, that opening is no longer available. You stay on our waitlist.`);
      return { outcome: 'offer_unavailable' };
    }
    const r = await acceptOffer(q, ctx, live.id);
    if (!r.filled) {
      await queueReply(q, ctx, patientId, `${practice.name}: Sorry, that opening was just taken. You stay on our waitlist.`);
      return { outcome: 'offer_unavailable' };
    }
    return { outcome: 'booked' };
  }
  if (NO_WORDS.has(word) && live) {
    await q.query("UPDATE offers SET status = 'declined', responded_at = now() WHERE id = $1", [live.id]);
    await q.query("UPDATE openings o SET status = 'open' WHERE o.status = 'offered' AND NOT EXISTS (SELECT 1 FROM offers x WHERE x.opening_id = o.id AND x.status = 'sent')");
    await queueReply(q, ctx, patientId, `${practice.name}: No problem. You stay on our waitlist.`);
    await audit(q, ctx, 'OFFER_DECLINED', { offerId: live.id });
    return { outcome: 'declined' };
  }
  return { outcome: 'needs_staff' };
}

// ───────────── scheduled job: expire stale offers ─────────────

/** Run every minute (EventBridge Scheduler in AWS). Releases openings whose offers all timed out. */
export async function expireOffers(db: Db, practiceId: string): Promise<{ expired: number; reopened: number }> {
  return db.tenant(practiceId, async (q) => {
    const exp = await q.query<{ opening_id: string }>("UPDATE offers SET status = 'expired' WHERE status = 'sent' AND expires_at <= now() RETURNING opening_id");
    const reopened = await q.query(
      `UPDATE openings o SET status = 'open'
        WHERE o.status = 'offered' AND NOT EXISTS (SELECT 1 FROM offers x WHERE x.opening_id = o.id AND x.status = 'sent') RETURNING o.id`,
    );
    if (exp.length) await audit(q, SYSTEM(practiceId), 'OFFERS_EXPIRED', { expired: exp.length, reopened: reopened.length });
    return { expired: exp.length, reopened: reopened.length };
  });
}

