import { serve } from '@hono/node-server';
import { createApp } from './app';
import { verifierFor } from './auth/tokens';
import { loadConfig } from './config';
import { migrate, openDb } from './db/adapter';
import { DEMO_PASSWORD, seedDemo, seedPlatformAdmin } from './db/seed';
import { runScheduled } from './jobs';
import { consoleEmail, sesEmail } from './services/email';
import { consoleProvider } from './services/messaging';
import { setScryptCost } from './services/passwords';

const config = loadConfig();
setScryptCost(config.SCRYPT_LOG_N);
const db = await openDb(config.DATABASE_URL);
const applied = await migrate(db);
if (applied.length) console.log(`[db] applied migrations: ${applied.join(', ')}`);

const [{ n }] = await db.platform((q) => q.query<{ n: number }>('SELECT count(*)::int AS n FROM platform_admins'));
if (config.NODE_ENV !== 'production') {
  const [{ p }] = await db.platform((q) => q.query<{ p: number }>('SELECT count(*)::int AS p FROM practices'));
  if (p === 0) {
    await seedDemo(db);
    console.log('[db] seeded the demo practice "Lakeside Dental"');
  }
  if (n === 0) await seedPlatformAdmin(db, 'admin@plenire.test', 'Platform Admin', DEMO_PASSWORD);
  console.log(`\n  Local demo sign-ins (password for all: ${DEMO_PASSWORD})\n    platform admin   admin@plenire.test   → /admin\n    clinic owner     mensah@lakeside.test\n    front desk       tracy@lakeside.test\n`);
} else if (n === 0) {
  console.warn('[setup] No platform admin exists yet. Create one with:  npm run admin:create -- you@example.com "Your Name"');
}

const { verifier, tokens } = verifierFor(config);
const email = config.EMAIL_PROVIDER === 'ses' ? sesEmail : consoleEmail;
const app = createApp({ db, config, verifier, tokens, provider: consoleProvider, email });

// Local stand-in for EventBridge Scheduler: expire stale offers and send queued texts every 30 seconds.
setInterval(() => runScheduled(db, consoleProvider).catch(() => console.error('[jobs] run failed')), 30_000).unref();

serve({ fetch: app.fetch, port: config.PORT }, (i) => console.log(`[api] listening on http://localhost:${i.port}  (sign-in: ${config.AUTH_MODE})`));
