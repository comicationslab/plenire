import type { Db, Queryable } from '../db/adapter';
import { audit, SYSTEM, type Ctx } from './audit';
import { AppError } from './errors';
import { queueMessage } from './messaging';

/**
 * Automatic texts tied to an appointment. Every text is a short template with NO treatment or health wording
 * (minimum necessary), goes through queueMessage (consent, STOP and health-wording checks) and lands in the same
 * messages table staff see on the Messages screen. A text that cannot be sent never blocks the booking or status change.
 */

interface Details {
  id: string; patient_id: string; first: string; day: string; time: string;
  practice: string; phone: string; review_url: string | null; can_text: boolean;
}

async function details(q: Queryable, appointmentId: string): Promise<Details | undefined> {
  const [d] = await q.query<Details>(
    `SELECT a.id, a.patient_id, split_part(pt.name, ' ', 1) AS first,
            to_char(a.starts_at AT TIME ZONE p.timezone, 'FMDy, FMMon FMDD') AS day,
            to_char(a.starts_at AT TIME ZONE p.timezone, 'FMHH12:MI AM') AS time,
            p.name AS practice, p.phone, p.google_review_url AS review_url,
            (pt.sms_consent AND pt.sms_opt_out_at IS NULL AND pt.phone IS NOT NULL) AS can_text
       FROM appointments a
       JOIN patients pt ON pt.practice_id = a.practice_id AND pt.id = a.patient_id
       JOIN practices p ON p.id = a.practice_id
      WHERE a.id = $1`,
    [appointmentId],
  );
  return d;
}

/** Queues the text, and records it in the ledger when `kind` is given so it can never go out twice. Returns whether a text was queued. */
async function send(q: Queryable, ctx: Ctx, d: Details, body: string, kind?: string): Promise<boolean> {
  if (!d.can_text) return false;
  if (kind) {
    const slot = await q.query(
      'INSERT INTO appointment_notifications (practice_id, appointment_id, kind) VALUES ($1,$2,$3) ON CONFLICT (appointment_id, kind) DO NOTHING RETURNING id',
      [ctx.practiceId, d.id, kind],
    );
    if (!slot.length) return false;
  }
  try {
    await queueMessage(q, ctx, d.patient_id, body);
    return true;
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    await audit(q, ctx, 'SMS_BLOCKED', { appointmentId: d.id, kind: kind ?? 'followup', code: e.code });
    return false;
  }
}

export async function sendConfirmation(q: Queryable, ctx: Ctx, appointmentId: string): Promise<boolean> {
  const d = await details(q, appointmentId);
  if (!d) return false;
  return send(q, ctx, d, `Hi ${d.first}, you're booked at ${d.practice} on ${d.day} at ${d.time}. Need to change it? Call ${d.phone}. Reply STOP to opt out.`, 'confirmation');
}

/** Thank-you after the visit, with the Google review link when the practice has set one. Sent once per visit. */
export async function sendThanks(q: Queryable, ctx: Ctx, appointmentId: string): Promise<boolean> {
  const d = await details(q, appointmentId);
  if (!d) return false;
  const body = d.review_url
    ? `Thanks for visiting ${d.practice} today, ${d.first}! If you have a minute, we'd love your review: ${d.review_url} Reply STOP to opt out.`
    : `Thanks for visiting ${d.practice} today, ${d.first}! We hope to see you again soon. Reply STOP to opt out.`;
  return send(q, ctx, d, body, 'thanks');
}

/**
 * Follow-up confirmation. The follow-up label is staff-typed ("2-week post-op check") and can be clinical, so the text only ever carries
 * the timing: an exact date from a custom follow-up, or the rough interval from a preset. Nothing else is copied into the SMS.
 */
export function followUpWording(label: string): string {
  const custom = /^Custom\s*·\s*(\w+ \d+)\s*·\s*(\d{1,2}:\d{2} [AP]M)/.exec(label);
  if (custom) return `Your follow-up visit is set for ${custom[1]} at ${custom[2]}.`;
  const interval = /^(\d+)-(week|month)/i.exec(label);
  if (interval) {
    const n = Number(interval[1]);
    return `Your next visit is due in about ${n} ${interval[2].toLowerCase()}${n === 1 ? '' : 's'}.`;
  }
  return 'A follow-up visit has been noted for you.';
}

export async function sendFollowUp(q: Queryable, ctx: Ctx, appointmentId: string, label: string): Promise<boolean> {
  const d = await details(q, appointmentId);
  if (!d) return false;
  return send(q, ctx, d, `Hi ${d.first}, ${d.practice}: ${followUpWording(label)} Need to book or change it? Call ${d.phone}. Reply STOP to opt out.`);
}

// ───────────── scheduled job: appointment reminders ─────────────

/**
 * Run every minute with the other scheduled work, around the clock: a 9:00 visit with a 2-hour reminder is texted at 7:00. For each lead time the practice chose (default 24h and 2h) it texts patients whose
 * appointment is still 'scheduled' and now inside that window. Rules, so nobody gets a pointless text:
 *  - a visit booked INSIDE the window gets no reminder for it (the confirmation just went out);
 *  - a late run catches up only briefly (up to 3h, or half the lead time) rather than texting a stale reminder;
 *  - each reminder is sent once, tracked in appointment_notifications.
 */
export async function queueReminders(db: Db, practiceId: string): Promise<{ queued: number }> {
  return db.tenant(practiceId, async (q) => {
    const ctx = SYSTEM(practiceId);
    const [p] = await q.query<{ reminder_hours: number[] }>('SELECT reminder_hours FROM practices WHERE id = $1', [practiceId]);
    if (!p) return { queued: 0 };
    let queued = 0;
    for (const h of p.reminder_hours) {
      const lead = h * 3600;
      const catchUp = Math.min(3, h / 2) * 3600;
      const due = await q.query<{ id: string }>(
        `SELECT a.id FROM appointments a
          WHERE a.status = 'scheduled'
            AND a.starts_at <= now() + make_interval(secs => $1::double precision)
            AND a.starts_at >  now() + make_interval(secs => ($1 - $2)::double precision)
            AND a.created_at <= a.starts_at - make_interval(secs => $1::double precision)
            AND NOT EXISTS (SELECT 1 FROM appointment_notifications n WHERE n.appointment_id = a.id AND n.kind = $3)
          ORDER BY a.starts_at LIMIT 200`,
        [lead, catchUp, `reminder_${h}h`],
      );
      for (const { id } of due) {
        const d = await details(q, id);
        if (!d) continue;
        const when = h <= 12 ? `today at ${d.time}` : `${d.day} at ${d.time}`;
        if (await send(q, ctx, d, `Hi ${d.first}, reminder from ${d.practice}: your appointment is ${when}. Need to change it? Call ${d.phone}. Reply STOP to opt out.`, `reminder_${h}h`)) queued++;
      }
    }
    if (queued) await audit(q, ctx, 'REMINDERS_QUEUED', { count: queued });
    return { queued };
  });
}
