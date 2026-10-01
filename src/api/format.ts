import type { Appointment, Patient, WaitlistEntry } from '../types/hipaa';
import { initialsOf } from '../lib/format';
import type { z } from 'zod';
import type * as S from './schemas';

/** Turns server data into the shapes the screens already know how to draw. All times are shown in the practice's time zone. */
export const fmtTime = (iso: string, tz: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
export const fmtDate = (iso: string, tz: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz });

export function minutesOfDay(iso: string, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

export const toAppointment = (a: z.infer<typeof S.appointmentSchema>, tz: string): Appointment => ({
  id: a.id, time: fmtTime(a.startsAt, tz), mins: minutesOfDay(a.startsAt, tz), dur: a.durationMin,
  patient: a.patientName, initials: initialsOf(a.patientName), provider: a.providerName, op: a.chair ?? '',
  treatment: a.treatment, status: a.status === 'cancelled' ? 'scheduled' : a.status,
  followUp: a.followUp ?? undefined, thanked: a.thanked, walkIn: a.walkIn,
});

export const toPatient = (p: z.infer<typeof S.patientSchema>, tz: string): Patient => ({
  id: p.id, name: p.name, initials: initialsOf(p.name), phone: p.phone ?? 'No phone on file', email: p.email ?? 'No email on file',
  lastVisit: p.lastVisit ? fmtDate(p.lastVisit, tz) : '—', recentVisit: p.recentVisit ?? '—', status: p.status,
  newPatient: p.newPatient, smsConsent: p.smsConsent && !p.optedOutAt, smsConsentAt: p.smsConsentAt ?? undefined, notes: p.notes ?? undefined, walkIn: p.walkIn,
});

const REASON = { high: 'ASAP', normal: 'Wants sooner', low: 'Overdue recall' } as const;
export const toWaitlist = (w: z.infer<typeof S.waitlistSchema>[number], tz: string): WaitlistEntry => ({
  id: w.id, name: w.patientName, initials: initialsOf(w.patientName), reason: REASON[w.urgency],
  wants: w.treatments.length ? w.treatments.map((t) => t[0].toUpperCase() + t.slice(1)).join(', ') : 'Any opening',
  provider: w.preferredProvider ?? 'Any provider', when: `Added ${fmtDate(w.addedAt, tz)}`, stopped: !w.smsConsent,
});

/** Converts "2026-10-02" + "13:30" at a given time zone into the exact moment (ISO), including daylight-saving. */
export function zonedToIso(date: string, time: string, tz: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = (utcMs: number) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs));
    const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - utcMs;
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first)).toISOString();
}

/** Today's date (YYYY-MM-DD) at the practice. */
export const todayIn = (tz: string) => new Date().toLocaleDateString('en-CA', { timeZone: tz });
