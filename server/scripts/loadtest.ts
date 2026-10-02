/**
 * Multi-clinic load test.   DATABASE_URL=postgres://… npm run loadtest -- --reset [--clinics 100] [--patients 1000]
 * WARNING: --reset wipes the database. Use a throwaway one.
 * Creates many clinics with realistic data, then hits the API as staff from many clinics at once and reports speed,
 * errors, and whether any clinic ever saw another clinic's data.
 */
import { createApp } from '../app';
import { localTokens } from '../auth/tokens';
import { migrate, pgAdapter } from '../db/adapter';
import { runScheduled } from '../jobs';
import { setScryptCost } from '../services/passwords';

const arg = (name: string, d: number) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const CLINICS = arg('clinics', 100);
const PATIENTS = arg('patients', 1000);
const USERS = arg('users', 24);   // simultaneous staff
const REQUESTS = arg('requests', 3000);

const url = process.env.DATABASE_URL;
if (!url || !process.argv.includes('--reset')) {
  console.error('Set DATABASE_URL to a THROWAWAY database and pass --reset (this wipes it).');
  process.exit(1);
}
setScryptCost(10);
const db = await pgAdapter(url);
await db.admin((q) => q.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'));
await migrate(db);

// ───────── build the data ─────────
let t0 = performance.now();
await db.admin(async (q) => {
  await q.query(`INSERT INTO practices (name, phone, timezone) SELECT 'Clinic ' || g, '(555) 000-' || lpad(g::text, 4, '0'), 'America/Chicago' FROM generate_series(1, $1) g`, [CLINICS]);
  await q.query(`INSERT INTO providers (practice_id, name, initials, chair, title) SELECT p.id, 'Dr. ' || n, 'D' || n, 'Op ' || n, 'Dentist' FROM practices p, generate_series(1, 4) n`);
  await q.query(`INSERT INTO staff (practice_id, email, name, role, status, accepted_at)
                 SELECT p.id, r.role || regexp_replace(p.name, '\\D', '', 'g') || '@load.test', r.role, r.role, 'active', now()
                   FROM practices p, (VALUES ('owner'), ('front_desk')) AS r(role)`);
  await q.query(`INSERT INTO patients (practice_id, name, phone, email, sms_consent, sms_consent_at)
                 SELECT p.id, 'C' || regexp_replace(p.name, '\\D', '', 'g') || '-Patient ' || lpad(n::text, 5, '0'), '+1555' || lpad((random() * 9999999)::int::text, 7, '0'), 'p' || n || '@x.test', true, now()
                   FROM practices p, generate_series(1, $1) n`, [PATIENTS]);
  await q.query(`WITH pt AS (SELECT id, practice_id, row_number() OVER (PARTITION BY practice_id ORDER BY name) rn FROM patients),
                      pr AS (SELECT id, practice_id, row_number() OVER (PARTITION BY practice_id ORDER BY name) rn FROM providers)
                 INSERT INTO appointments (practice_id, patient_id, provider_id, starts_at, duration_min, treatment)
                 SELECT pt.practice_id, pt.id, pr.id, date_trunc('day', now() AT TIME ZONE 'America/Chicago') AT TIME ZONE 'America/Chicago' + make_interval(hours => (8 + (pt.rn % 9))::int), 45, 'Cleaning'
                   FROM pt JOIN pr ON pr.practice_id = pt.practice_id AND pr.rn = 1 + pt.rn % 4 WHERE pt.rn <= 40`);
  await q.query(`WITH pt AS (SELECT id, practice_id, row_number() OVER (PARTITION BY practice_id ORDER BY name) rn FROM patients),
                      pr AS (SELECT DISTINCT ON (practice_id) id, practice_id FROM providers ORDER BY practice_id, name)
                 INSERT INTO openings (practice_id, provider_id, starts_at, duration_min, kind, treatment, status, filled_at, value_cents, filled_by_patient_id)
                 SELECT pr.practice_id, pr.id, now() - make_interval(days => 1 + (g % 27)), 60, 'no-show', 'Recall + exam', CASE WHEN g <= 20 THEN 'filled' ELSE 'closed' END,
                        CASE WHEN g <= 20 THEN now() END, CASE WHEN g <= 20 THEN 12000 END, CASE WHEN g <= 20 THEN pt.id END
                   FROM pr JOIN pt ON pt.practice_id = pr.practice_id AND pt.rn = 100, generate_series(1, 30) g`);
  await q.query(`WITH pt AS (SELECT id, practice_id, row_number() OVER (PARTITION BY practice_id ORDER BY name) rn FROM patients)
                 INSERT INTO waitlist_entries (practice_id, patient_id, treatments, urgency) SELECT practice_id, id, '{cleaning,exam}', 'normal' FROM pt WHERE rn BETWEEN 200 AND 240`);
  await q.query(`WITH pt AS (SELECT id, practice_id, row_number() OVER (PARTITION BY practice_id ORDER BY name) rn FROM patients)
                 INSERT INTO messages (practice_id, patient_id, direction, body, status, sent_at)
                 SELECT practice_id, id, d.dir, 'Sample message ' || d.dir, CASE WHEN d.dir = 'out' THEN 'sent' ELSE 'received' END, now() FROM pt, (VALUES ('out'), ('in')) AS d(dir) WHERE rn BETWEEN 300 AND 340`);
  await q.query('ANALYZE');
});
const [{ n: totalPatients }] = await db.admin((q) => q.query<{ n: number }>('SELECT count(*)::int AS n FROM patients'));
console.log(`\nBuilt ${CLINICS} clinics with ${totalPatients.toLocaleString()} patients in ${((performance.now() - t0) / 1000).toFixed(1)}s`);

// ───────── an app wired like production, tokens for every clinic's owner ─────────
const tokens = localTokens('load-test-secret-that-is-at-least-32-chars');
const app = createApp({ db, verifier: tokens, tokens, provider: { send: async () => {} }, config: { CORS_ORIGINS: '', ENABLE_SIMULATOR: 'true' } });
const owners = await db.admin((q) => q.query<{ id: string; practice_id: string; idx: string }>(`SELECT id, practice_id, regexp_replace(email, '\\D', '', 'g') AS idx FROM staff WHERE role = 'owner'`));
const sessions = await Promise.all(owners.map(async (o) => ({ idx: o.idx, token: await tokens.issue({ staffId: o.id, practiceId: o.practice_id, role: 'owner' }, 3600) })));
const pick = () => sessions[Math.floor(Math.random() * sessions.length)];

const pct = (xs: number[], p: number) => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((xs.length * p) / 100))];
const ENDPOINTS = ['/api/patients', '/api/appointments', '/api/openings', '/api/conversations', '/api/metrics/recovery', '/api/metrics/revenue', '/api/waitlist', '/api/patients/summary'];

// ───────── 1. speed under concurrency + isolation check ─────────
const lat = new Map<string, number[]>(ENDPOINTS.map((e) => [e, []]));
let errors = 0, leaks = 0, issued = 0;
t0 = performance.now();
async function user() {
  while (issued < REQUESTS) {
    issued++;
    const s = pick();
    const ep = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
    const start = performance.now();
    const res = await app.request(ep, { headers: { authorization: `Bearer ${s.token}` } });
    lat.get(ep)!.push(performance.now() - start);
    if (res.status !== 200) { errors++; continue; }
    if (ep === '/api/patients') {
      const rows = (await res.json()) as { name: string }[];
      if (rows.some((r) => !r.name.startsWith(`C${s.idx}-`))) leaks++; // a patient from another clinic would be a breach
    } else await res.arrayBuffer();
  }
}
await Promise.all(Array.from({ length: USERS }, user));
const wall = (performance.now() - t0) / 1000;

console.log(`\n${REQUESTS.toLocaleString()} requests from ${USERS} simultaneous staff across ${CLINICS} clinics in ${wall.toFixed(1)}s → ${(REQUESTS / wall).toFixed(0)} requests/second`);
console.log('endpoint                       p50     p95     p99   (ms)');
for (const [ep, xs] of lat) if (xs.length) console.log(`${ep.padEnd(28)} ${pct(xs, 50).toFixed(0).padStart(5)} ${pct(xs, 95).toFixed(0).padStart(7)} ${pct(xs, 99).toFixed(0).padStart(7)}`);
console.log(`errors: ${errors}    cross-clinic data leaks: ${leaks}`);

// ───────── 2. do the row-level-security filters use the indexes? ─────────
const plan = await db.tenant(owners[0].practice_id, (q) => q.query<{ 'QUERY PLAN': string }>('EXPLAIN SELECT * FROM patients ORDER BY name LIMIT 500'));
const planText = plan.map((r) => r['QUERY PLAN']).join('\n');
console.log(`\nQuery plan for "list patients" as one clinic (should use an index, not scan all ${totalPatients.toLocaleString()} patients):\n${planText.split('\n').slice(0, 4).map((l) => '  ' + l).join('\n')}`);
const usesIndex = /Index/.test(planText) && !/Seq Scan on patients/.test(planText);

// ───────── 3. many clinics writing at once, and the scheduled job ─────────
t0 = performance.now();
const writers = sessions.slice(0, Math.min(60, sessions.length)).map(async (s) => {
  const appts = (await (await app.request('/api/appointments', { headers: { authorization: `Bearer ${s.token}` } })).json()) as { id: string }[];
  const ns = await app.request(`/api/appointments/${appts[0].id}/status`, { method: 'PATCH', headers: { authorization: `Bearer ${s.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'noshow' }) });
  const { openingId } = (await ns.json()) as { openingId: string };
  const offers = await app.request(`/api/openings/${openingId}/offers`, { method: 'POST', headers: { authorization: `Bearer ${s.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ limit: 3 }) });
  return offers.status;
});
const statuses = await Promise.all(writers);
console.log(`\n${statuses.length} clinics ran no-show → send offers at the same moment in ${((performance.now() - t0) / 1000).toFixed(1)}s (failures: ${statuses.filter((s) => s !== 200).length})`);

t0 = performance.now();
const job = await runScheduled(db, { send: async () => {} });
console.log(`Scheduled job (expire offers + send queued texts) for ${job.practices} clinics: ${((performance.now() - t0) / 1000).toFixed(1)}s, failures ${job.failed}`);

await db.close();
const pass = errors === 0 && leaks === 0 && usesIndex;
console.log(pass ? '\nRESULT: pass (no errors, no leaks, indexes used)\n' : '\nRESULT: ATTENTION NEEDED (see above)\n');
process.exit(pass ? 0 : 1);
