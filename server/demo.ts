/**
 * A guided tour of the backend. Run:  npm run demo
 * Uses the built-in local database, nothing to install. Prints what happens at each step.
 */
import { createApp } from './app';
import { devAuth } from './auth/tokens';
import { migrate, pgliteAdapter } from './db/adapter';
import { seedDemo } from './db/seed';
import type { MessageProvider } from './services/messaging';

const db = await pgliteAdapter();
await migrate(db);
const seeded = await seedDemo(db);
const dev = devAuth();
const texts: string[] = [];
const provider: MessageProvider = { send: async (to) => void texts.push(to) };
const app = createApp({ db, verifier: dev, dev, provider, config: { CORS_ORIGINS: '', ENABLE_SIMULATOR: 'true' } });

const api = async (method: string, path: string, token?: string, body?: unknown) => {
  const r = await app.request(path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: (await r.json()) as any };
};
const say = (s: string) => console.log(s);
const usd = (c: number) => '$' + (c / 100).toLocaleString('en-US');

say('\n1. Tracy (front desk) signs in');
const tracy = (await api('POST', '/auth/dev-login', undefined, { email: 'tracy@lakeside.test' })).data.token;
const mensah = (await api('POST', '/auth/dev-login', undefined, { email: 'mensah@lakeside.test' })).data.token;
say('   Got a signed, expiring token. The token itself says which practice and role she has.');

say('\n2. Isabella does not show up for her 2:00 PM crown appointment');
const ns = await api('PATCH', `/api/appointments/${seeded.appointments['Isabella Flores']}/status`, tracy, { status: 'noshow' });
say(`   An empty slot (opening) was created automatically: ${ns.data.openingId.slice(0, 8)}…`);

say('\n3. Plenire texts the best people on the waitlist');
const offers = await api('POST', `/api/openings/${ns.data.openingId}/offers`, tracy, { limit: 3 });
say(`   ${offers.data.offered} patients offered the slot. ${texts.length} texts handed to the carrier.`);
say('   (Hannah is on the waitlist but never agreed to texts, so she is skipped.)');

say('\n4. Priya replies YES, and Tyler replies YES a moment later');
const priya = await api('POST', `/api/patients/${seeded.patients['Priya Shah']}/simulate-reply`, tracy, { body: 'YES' });
const tyler = await api('POST', `/api/patients/${seeded.patients['Tyler Green']}/simulate-reply`, tracy, { body: 'YES' });
say(`   Priya: ${priya.data.outcome}.  Tyler: ${tyler.data.outcome} (the slot was already taken).`);

say('\n5. What each person sees on their dashboard');
const rate = await api('GET', '/api/metrics/recovery', tracy);
say(`   Front desk  → recovery rate ${rate.data.period.ratePercent}% (${rate.data.period.filled} of ${rate.data.period.openings} openings filled). No dollar amounts.`);
const blocked = await api('GET', '/api/metrics/revenue', tracy);
say(`   Front desk asking for revenue → HTTP ${blocked.status} ${blocked.data.error.code}`);
const rev = await api('GET', '/api/metrics/revenue', mensah);
say(`   Owner       → estimated revenue recovered ${usd(rev.data.period.revenueCents)} (from the practice's own fee list)`);

say('\n6. The tamper-proof activity log');
const log = await api('GET', '/api/audit', mensah);
for (const e of [...log.data].reverse()) say(`   #${e.seq}  ${e.action}`);
const ver = await api('GET', '/api/audit/verify', mensah);
say(`   Chain check: ${ver.data.intact ? 'intact ✔' : 'BROKEN at #' + ver.data.firstBrokenSeq}`);
say('\nDone. Everything above used a real database with per-practice isolation.\n');
await db.close();
