import { serve } from '@hono/node-server';
import { createApp } from './app';
import { verifierFor } from './auth/tokens';
import { loadConfig } from './config';
import { migrate, openDb } from './db/adapter';
import { seedDemo } from './db/seed';
import { runScheduled } from './jobs';
import { consoleProvider } from './services/messaging';

const config = loadConfig();
const db = await openDb(config.DATABASE_URL);
const applied = await migrate(db);
if (applied.length) console.log(`[db] applied migrations: ${applied.join(', ')}`);

if (config.NODE_ENV !== 'production') {
  const count = await db.admin((q) => q.query<{ n: number }>('SELECT count(*)::int AS n FROM practices'));
  if (count[0].n === 0) {
    await seedDemo(db);
    console.log('[db] seeded demo practice. Sign in with: tracy@lakeside.test (front desk) or mensah@lakeside.test (owner)');
  }
}

const { verifier, dev } = verifierFor(config);
const app = createApp({ db, config, verifier, dev, provider: consoleProvider });

// Local stand-in for EventBridge Scheduler: expire stale offers and send queued texts every 30 seconds.
setInterval(() => runScheduled(db, consoleProvider).catch(() => console.error('[jobs] run failed')), 30_000).unref();

serve({ fetch: app.fetch, port: config.PORT }, (i) => console.log(`[api] listening on http://localhost:${i.port}  (auth: ${config.AUTH_MODE})`));
