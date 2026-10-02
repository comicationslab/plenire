import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Queryable {
  /** Returns rows. Always use $1, $2… parameters, never string-built SQL. */
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs several statements at once (migrations only; no parameters). */
  exec(sql: string): Promise<void>;
}

export interface Db {
  /** One transaction as the low-privilege app role, locked to ONE practice (row-level security applies). */
  tenant<T>(practiceId: string, fn: (q: Queryable) => Promise<T>): Promise<T>;
  /** Sign-in, invitations and password resets. Can look people up across practices but cannot read any patient data. */
  auth<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  /** The operator console: create practices and users. Has no access to patient data (enforced by the database). */
  platform<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  /** Owner-level access: migrations and seeding only. */
  admin<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const assertUuid = (v: string) => {
  if (!UUID.test(v)) throw new Error('Invalid practice id');
};

const SCOPE_SQL = ['SET LOCAL ROLE plenire_app', "SELECT set_config('app.practice_id', $1, true)"] as const;

/** Real PostgreSQL (AWS RDS / Aurora in production). */
export async function pgAdapter(connectionString: string): Promise<Db> {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString, max: Number(process.env.PG_POOL_MAX ?? 10) });

  async function inTx<T>(setup: (c: import('pg').PoolClient) => Promise<void>, fn: (q: Queryable) => Promise<T>, beginsItself = false) {
    const client = await pool.connect();
    try {
      if (!beginsItself) await client.query('BEGIN');
      await setup(client);
      const out = await fn({
        query: async (sql, params) => (await client.query(sql, params as any[])).rows,
        exec: async (sql) => void (await client.query(sql)),
      });
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  // BEGIN + role + practice scope go out as ONE round trip (the id is validated as a UUID first, so inlining it is safe).
  const open = (c: import('pg').PoolClient, role: string, practiceId?: string) =>
    c.query(`BEGIN; SET LOCAL ROLE ${role};${practiceId ? ` SELECT set_config('app.practice_id', '${practiceId}', true);` : ''}`);

  return {
    tenant: async (practiceId, fn) => {
      assertUuid(practiceId);
      return inTx((c) => open(c, 'plenire_app', practiceId).then(() => {}), fn, true);
    },
    auth: (fn) => inTx((c) => open(c, 'plenire_auth').then(() => {}), fn, true),
    platform: (fn) => inTx((c) => open(c, 'plenire_platform').then(() => {}), fn, true),
    admin: (fn) => inTx(async () => {}, fn),
    close: () => pool.end(),
  };
}

/** Zero-install PostgreSQL (WASM) so `npm run dev:api` works with nothing else installed. Local development only. */
export async function pgliteAdapter(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite(dataDir);
  await db.waitReady;

  const wrap = (tx: { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>; exec: (sql: string) => Promise<unknown> }): Queryable => ({
    query: async (sql, params) => (await tx.query(sql, params as any[])).rows,
    exec: async (sql) => void (await tx.exec(sql)),
  });

  return {
    tenant: async (practiceId, fn) => {
      assertUuid(practiceId);
      return db.transaction(async (tx) => {
        await tx.query(SCOPE_SQL[0]);
        await tx.query(SCOPE_SQL[1], [practiceId]);
        return fn(wrap(tx));
      });
    },
    auth: (fn) => db.transaction(async (tx) => { await tx.query('SET LOCAL ROLE plenire_auth'); return fn(wrap(tx)); }),
    platform: (fn) => db.transaction(async (tx) => { await tx.query('SET LOCAL ROLE plenire_platform'); return fn(wrap(tx)); }),
    admin: (fn) => db.transaction(async (tx) => fn(wrap(tx))),
    close: () => db.close(),
  };
}

export async function openDb(databaseUrl?: string): Promise<Db> {
  return databaseUrl ? pgAdapter(databaseUrl) : pgliteAdapter();
}

/** Applies any migration files not yet applied (tracked in schema_migrations). Safe to run on every start. */
export async function migrate(db: Db): Promise<string[]> {
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  await db.admin(async (q) => {
    await q.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await q.query<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name));
    for (const f of files) {
      if (done.has(f)) continue;
      await q.exec(readFileSync(join(dir, f), 'utf8'));
      await q.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      applied.push(f);
    }
  });
  return applied;
}
