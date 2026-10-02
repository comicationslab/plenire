import type { Db } from './adapter';
import type { Role } from '../auth/tokens';
import { hashPassword } from '../services/passwords';

export interface SeedStaff { email: string; name: string; role: Role; password?: string }
export interface SeededPractice { practiceId: string; staff: Record<string, { id: string; role: Role }>; patients: Record<string, string>; providers: Record<string, string>; appointments: Record<string, string> }

/** Creates a practice with staff, providers, patients, today's schedule, a waitlist and a fee schedule. */
export async function seedPractice(
  db: Db,
  opts: { name: string; phone: string; staff: SeedStaff[]; withSchedule?: boolean; timezone?: string; history?: boolean },
): Promise<SeededPractice> {
  const tz = opts.timezone ?? 'America/Chicago';
  const out: SeededPractice = { practiceId: '', staff: {}, patients: {}, providers: {}, appointments: {} };

  await db.admin(async (q) => {
    const [p] = await q.query<{ id: string }>('INSERT INTO practices (name, phone, timezone, address) VALUES ($1,$2,$3,$4) RETURNING id', [
      opts.name, opts.phone, tz, '123 Main Street',
    ]);
    out.practiceId = p.id;
    for (const s of opts.staff) {
      const [r] = await q.query<{ id: string }>("INSERT INTO staff (practice_id, email, name, role, status, accepted_at) VALUES ($1,$2,$3,$4,'active', now()) RETURNING id", [p.id, s.email.toLowerCase(), s.name, s.role]);
      out.staff[s.email] = { id: r.id, role: s.role };
      if (s.password) await q.query("INSERT INTO credentials (principal_id, principal_type, password_hash) VALUES ($1,'staff',$2)", [r.id, await hashPassword(s.password)]);
    }
  });
  if (opts.withSchedule === false) return out;

  await db.tenant(out.practiceId, async (q) => {
    const id = out.practiceId;
    for (const [name, initials, chair, title] of [
      ['Dr. Mensah', 'NM', 'Op 1', 'General & Restorative Dentistry'], ['Dr. Patel', 'AP', 'Op 3', 'Cosmetic & General Dentistry'],
      ['RDH Nguyen', 'LN', 'Hyg 1', 'Lead Dental Hygienist'], ['RDH Brooks', 'MB', 'Hyg 2', 'Registered Dental Hygienist'],
    ]) {
      const [r] = await q.query<{ id: string }>('INSERT INTO providers (practice_id, name, initials, chair, title) VALUES ($1,$2,$3,$4,$5) RETURNING id', [id, name, initials, chair, title]);
      out.providers[name] = r.id;
    }
    const people: [string, string, boolean][] = [
      ['Isabella Flores', '+15555550101', true], ['Liam O\'Brien', '+15555550102', true], ['Mia Coleman', '+15555550103', true],
      ['Priya Shah', '+15555550104', true], ['Tyler Green', '+15555550105', true], ['Hannah Cho', '+15555550106', false],
    ];
    for (const [name, phone, consent] of people) {
      const [r] = await q.query<{ id: string }>(
        'INSERT INTO patients (practice_id, name, phone, sms_consent, sms_consent_at) VALUES ($1,$2,$3,$4, CASE WHEN $4 THEN now() END) RETURNING id',
        [id, name, phone, consent],
      );
      out.patients[name] = r.id;
    }
    const slot = (h: number, m = 0) => [`((now() AT TIME ZONE '${tz}')::date + make_interval(hours => ${h}, mins => ${m})) AT TIME ZONE '${tz}'`][0];
    const appts: [string, string, number, number, string][] = [
      ['Isabella Flores', 'Dr. Mensah', 14, 0, 'Crown prep #19'],
      ['Liam O\'Brien', 'Dr. Patel', 11, 0, 'SRP — upper right'],
      ['Mia Coleman', 'RDH Nguyen', 16, 0, 'Recall + exam'],
    ];
    for (const [pt, pr, h, m, t] of appts) {
      const [r] = await q.query<{ id: string }>(
        `INSERT INTO appointments (practice_id, patient_id, provider_id, starts_at, duration_min, treatment) VALUES ($1,$2,$3, ${slot(h, m)}, 60, $4) RETURNING id`,
        [id, out.patients[pt], out.providers[pr], t],
      );
      out.appointments[pt] = r.id;
    }
    // Waitlist: Priya wants crown work, Tyler wants cleanings, Hannah never consented to texts.
    await q.query(`INSERT INTO waitlist_entries (practice_id, patient_id, treatments, preferred_provider_id, urgency) VALUES ($1,$2,'{crown}',$3,'high')`, [id, out.patients['Priya Shah'], out.providers['Dr. Mensah']]);
    await q.query(`INSERT INTO waitlist_entries (practice_id, patient_id, treatments, urgency) VALUES ($1,$2,'{recall,prophy,exam}','normal')`, [id, out.patients['Tyler Green']]);
    await q.query(`INSERT INTO waitlist_entries (practice_id, patient_id, treatments, urgency) VALUES ($1,$2,'{crown}','normal')`, [id, out.patients['Hannah Cho']]);
    for (const [k, c] of [['srp', 28500], ['crown', 115000], ['prophy', 12000], ['recall', 12000], ['exam', 9500]] as const) {
      await q.query('INSERT INTO fee_schedule (practice_id, keyword, fee_cents) VALUES ($1,$2,$3)', [id, k, c]);
    }
    if (opts.history) {
      // Demo only: ~4 weeks of past openings (34 of 52 filled) so the dashboards have a story to tell.
      await q.query(
        `INSERT INTO openings (practice_id, provider_id, starts_at, duration_min, kind, treatment, status, filled_at, value_cents)
         SELECT $1, $2, now() - make_interval(days => 1 + (g % 27), hours => g % 5), 60,
                (ARRAY['no-show','cancellation','gap'])[1 + g % 3], 'Recall + exam',
                CASE WHEN g <= 34 THEN 'filled' ELSE 'closed' END,
                CASE WHEN g <= 34 THEN now() - make_interval(days => 1 + (g % 27)) END,
                CASE WHEN g <= 34 THEN (ARRAY[12000,28500,9500,115000,12000,28500,12000])[1 + g % 7] END
           FROM generate_series(1, 52) g`,
        [id, out.providers['Dr. Mensah']],
      );
    }
  });
  return out;
}

/** Local development only. Real users always choose their own password from an invitation link. */
export const DEMO_PASSWORD = 'Maple-Harbor-Cedar-92';
export const DEMO_STAFF: SeedStaff[] = [
  { email: 'tracy@lakeside.test', name: 'Tracy R.', role: 'front_desk', password: DEMO_PASSWORD },
  { email: 'mensah@lakeside.test', name: 'Dr. Kwame Mensah', role: 'owner', password: DEMO_PASSWORD },
];

export async function seedPlatformAdmin(db: Db, email: string, name: string, password: string): Promise<string> {
  return db.admin(async (q) => {
    const [a] = await q.query<{ id: string }>("INSERT INTO platform_admins (email, name, status) VALUES ($1,$2,'active') RETURNING id", [email.toLowerCase(), name]);
    await q.query("INSERT INTO credentials (principal_id, principal_type, password_hash) VALUES ($1,'platform',$2)", [a.id, await hashPassword(password)]);
    return a.id;
  });
}

export const seedDemo = (db: Db) => seedPractice(db, { name: 'Lakeside Dental', phone: '(555) 010-0100', staff: DEMO_STAFF, history: true });
