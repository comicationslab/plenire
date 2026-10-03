import type { Queryable } from '../db/adapter';
import { assertWithinHours } from './hours';
import { sendConfirmation } from './notifications';
import { AppError } from './errors';
import { audit, type Ctx } from './audit';

export interface NewPatient {
  name: string;
  phone?: string | null;
  email?: string | null;
  smsConsent?: boolean;
  newPatient?: boolean;
  walkIn?: boolean;
  notes?: string | null;
}

export async function createPatient(q: Queryable, ctx: Ctx, p: NewPatient): Promise<string> {
  const [row] = await q.query<{ id: string }>(
    `INSERT INTO patients (practice_id, name, phone, email, sms_consent, sms_consent_at, new_patient, walk_in, notes)
     VALUES ($1,$2,$3,$4,$5, CASE WHEN $5 THEN now() END, $6,$7,$8) RETURNING id`,
    [ctx.practiceId, p.name, p.phone ?? null, p.email ?? null, p.smsConsent ?? false, p.newPatient ?? false, p.walkIn ?? false, p.notes ?? null],
  );
  await audit(q, ctx, 'PATIENT_CREATED', { patientId: row.id, smsConsent: p.smsConsent ?? false });
  return row.id;
}

/** Checks the provider is free, holding a per-provider lock so two bookings can't take the same time. */
async function assertFree(q: Queryable, providerId: string, startsAt: string, durationMin: number) {
  await q.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 1))', [providerId]);
  const clash = await q.query(
    `SELECT 1 FROM appointments
      WHERE provider_id = $1 AND status NOT IN ('cancelled','noshow')
        AND starts_at < $2::timestamptz + make_interval(mins => $3)
        AND starts_at + make_interval(mins => duration_min) > $2::timestamptz LIMIT 1`,
    [providerId, startsAt, durationMin],
  );
  if (clash.length) throw new AppError(409, 'SLOT_TAKEN', 'That provider is already booked at that time');
}

export interface NewAppointment {
  patientId: string;
  providerId: string;
  startsAt: string;
  durationMin: number;
  treatment: string;
  walkIn?: boolean;
  insurancePlan?: string | null;
  selfPay?: boolean;
}

export async function createAppointment(q: Queryable, ctx: Ctx, a: NewAppointment): Promise<string> {
  const [prov] = await q.query('SELECT 1 FROM providers WHERE id = $1', [a.providerId]);
  const [pt] = await q.query('SELECT 1 FROM patients WHERE id = $1', [a.patientId]);
  if (!prov) throw new AppError(404, 'PROVIDER_NOT_FOUND');
  if (!pt) throw new AppError(404, 'PATIENT_NOT_FOUND');
  if (!a.walkIn) await assertWithinHours(q, ctx, a.providerId, a.startsAt, a.durationMin);
  await assertFree(q, a.providerId, a.startsAt, a.durationMin);
  const [row] = await q.query<{ id: string }>(
    `INSERT INTO appointments (practice_id, patient_id, provider_id, starts_at, duration_min, treatment, walk_in, insurance_plan, self_pay)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [ctx.practiceId, a.patientId, a.providerId, a.startsAt, a.durationMin, a.treatment, a.walkIn ?? false, a.selfPay ? null : (a.insurancePlan ?? null), a.selfPay ?? false],
  );
  await audit(q, ctx, a.walkIn ? 'WALKIN_ADDED' : 'APPT_CREATED', { appointmentId: row.id });
  return row.id;
}

export interface Booking {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  newPatient: boolean;
  smsConsent: boolean;
  notes?: string | null;
  /** Local date and time at the practice, e.g. 2026-10-02 and 13:30 */
  date: string;
  time: string;
  durationMin: number;
  treatment: string;
  /** null = any available provider */
  providerId: string | null;
  /** Plan name picked (or typed) on the booking page. Ignored when selfPay is true. */
  insurancePlan?: string | null;
  /** "I don't have insurance" */
  selfPay?: boolean;
}

/** One transaction: find-or-create the patient, pick a free provider, book, audit. */
export async function bookAppointment(q: Queryable, ctx: Ctx, b: Booking) {
  const [{ starts_at }] = await q.query<{ starts_at: string }>(
    `SELECT (($1::date + $2::time) AT TIME ZONE timezone) AS starts_at FROM practices WHERE id = $3`,
    [b.date, b.time, ctx.practiceId],
  );

  let providerId = b.providerId;
  if (providerId) {
    const [p] = await q.query('SELECT 1 FROM providers WHERE id = $1', [providerId]);
    if (!p) throw new AppError(404, 'PROVIDER_NOT_FOUND');
  } else {
    const all = await q.query<{ id: string }>('SELECT id FROM providers WHERE chair IS NOT NULL ORDER BY name');
    for (const p of all) {
      try { await assertWithinHours(q, ctx, p.id, starts_at, b.durationMin); await assertFree(q, p.id, starts_at, b.durationMin); providerId = p.id; break; } catch (e) { if (!(e instanceof AppError)) throw e; }
    }
    if (!providerId) throw new AppError(409, 'SLOT_TAKEN', 'No provider is free at that time');
  }

  const name = `${b.firstName} ${b.lastName}`.trim();
  const [existing] = await q.query<{ id: string }>('SELECT id FROM patients WHERE phone = $1 AND lower(name) = lower($2) LIMIT 1', [b.phone, name]);
  const patientId = existing?.id ?? (await createPatient(q, ctx, { name, phone: b.phone, email: b.email, smsConsent: b.smsConsent, newPatient: b.newPatient, notes: b.notes }));
  if (existing && b.smsConsent) await q.query('UPDATE patients SET sms_consent = true, sms_consent_at = COALESCE(sms_consent_at, now()), sms_opt_out_at = NULL WHERE id = $1 AND sms_opt_out_at IS NULL', [patientId]);

  const appointmentId = await createAppointment(q, ctx, { patientId, providerId, startsAt: starts_at, durationMin: b.durationMin, treatment: b.treatment, insurancePlan: b.insurancePlan, selfPay: b.selfPay });
  // What they just told us is their current insurance. (Not answering leaves what is on file alone.)
  if (b.selfPay || b.insurancePlan) {
    await q.query('UPDATE patients SET insurance_plan = $2, self_pay = $3 WHERE id = $1', [patientId, b.selfPay ? null : b.insurancePlan, !!b.selfPay]);
  }
  await audit(q, ctx, 'PATIENT_BOOKED', { appointmentId });
  await sendConfirmation(q, ctx, appointmentId);   // best effort: no consent / opted out / blocked wording never fails the booking
  const [prov] = await q.query<{ name: string }>('SELECT name FROM providers WHERE id = $1', [providerId]);
  return { appointmentId, patientId, providerName: prov.name, reference: 'PL-' + appointmentId.replace(/-/g, '').slice(0, 8).toUpperCase() };
}
