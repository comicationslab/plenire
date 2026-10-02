/**
 * A guided tour of the backend. Run:  npm run demo
 * Uses the built-in local database, nothing to install. Prints what happens at each step.
 */
import { createApp } from './app';
import { localTokens } from './auth/tokens';
import { migrate, pgliteAdapter } from './db/adapter';
import { DEMO_PASSWORD, seedDemo, seedPlatformAdmin } from './db/seed';
import type { MessageProvider } from './services/messaging';
import { setScryptCost } from './services/passwords';

setScryptCost(10);
const db = await pgliteAdapter();
await migrate(db);
const seeded = await seedDemo(db);
await seedPlatformAdmin(db, 'admin@plenire.test', 'Platform Admin', DEMO_PASSWORD);
const tokens = localTokens();
const texts: string[] = [];
const provider: MessageProvider = { send: async (to) => void texts.push(to) };
const app = createApp({ db, verifier: tokens, tokens, provider, config: { CORS_ORIGINS: '', ENABLE_SIMULATOR: 'true', AUTH_RATE_LIMIT_PER_MINUTE: 1000 } });

const call = async (method: string, path: string, token?: string, body?: unknown) => {
  const r = await app.request(path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: (await r.json()) as any };
};
const signIn = async (email: string, password = DEMO_PASSWORD) => (await call('POST', '/auth/login', undefined, { email, password })).data.accessToken as string;
const say = (s: string) => console.log(s);
const usd = (c: number) => '$' + (c / 100).toLocaleString('en-US');

say('\n1. Sign-in needs a real password now');
const wrong = await call('POST', '/auth/login', undefined, { email: 'tracy@lakeside.test', password: 'wrong-password-123' });
say(`   Wrong password → HTTP ${wrong.status} "${wrong.data.error.message}"`);
const tracy = await signIn('tracy@lakeside.test');
const mensah = await signIn('mensah@lakeside.test');
say('   Right password → a short-lived signed token (10 minutes) plus a private refresh cookie.');

say('\n2. You (platform admin) add a brand-new clinic and invite its owner');
const admin = await signIn('admin@plenire.test');
const created = await call('POST', '/api/platform/practices', admin, { name: 'Riverbend Family Dental', phone: '(555) 010-0200', timezone: 'America/New_York', ownerName: 'Dr. Dana Reyes', ownerEmail: 'dana@riverbend.test' });
say(`   Practice created. Dana gets a one-time link to choose her OWN password (${created.data.inviteLink.slice(0, 48)}…)`);
const token = new URL(created.data.inviteLink).searchParams.get('token');
const accepted = await call('POST', '/auth/accept-invite', undefined, { token, password: 'Orange-Falcon-Lantern-27' });
say(`   Dana chose a password and is signed in as: ${accepted.data.user.role} of ${accepted.data.user.practiceName}`);
const peek = await call('GET', '/api/patients', admin);
say(`   You, the platform admin, asking for patient data → HTTP ${peek.status} ${peek.data.error.code} (the operator console never sees patients)`);

say('\n3. Meanwhile, at Lakeside Dental: Isabella no-shows her 2:00 PM crown appointment');
const ns = await call('PATCH', `/api/appointments/${seeded.appointments['Isabella Flores']}/status`, tracy, { status: 'noshow' });
const offers = await call('POST', `/api/openings/${ns.data.openingId}/offers`, tracy, { limit: 3 });
say(`   ${offers.data.offered} waitlisted patients were texted. Priya replies YES:`);
const priya = await call('POST', `/api/patients/${seeded.patients['Priya Shah']}/simulate-reply`, tracy, { body: 'YES' });
say(`   → ${priya.data.outcome}`);

say('\n4. Dashboards');
const rate = await call('GET', '/api/metrics/recovery', tracy);
say(`   Front desk → recovery rate ${rate.data.period.ratePercent}%. Asking for revenue → HTTP ${(await call('GET', '/api/metrics/revenue', tracy)).status}`);
const rev = await call('GET', '/api/metrics/revenue', mensah);
say(`   Owner → estimated revenue recovered ${usd(rev.data.period.revenueCents)}`);

say('\n5. Dana (new clinic) sees none of Lakeside\'s data');
const dana = accepted.data.accessToken as string;
say(`   Dana\'s patients: ${(await call('GET', '/api/patients', dana)).data.length}   (Lakeside has ${(await call('GET', '/api/patients', tracy)).data.length})`);

say('\n6. Tamper-proof activity log');
const log = await call('GET', '/api/audit', mensah);
say(`   ${log.data.length} entries, chain check: ${(await call('GET', '/api/audit/verify', mensah)).data.intact ? 'intact ✔' : 'BROKEN'}`);
say('\nDone.\n');
await db.close();
