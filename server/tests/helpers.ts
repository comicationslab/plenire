import { migrate, pgAdapter, pgliteAdapter, type Db } from '../db/adapter';

/** Fresh empty database per test file. Uses real Postgres when TEST_DATABASE_URL is set, otherwise PGlite. */
export async function freshDb(): Promise<Db> {
  const url = process.env.TEST_DATABASE_URL;
  const db = url ? await pgAdapter(url) : await pgliteAdapter();
  if (url) await db.admin((q) => q.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'));
  await migrate(db);
  return db;
}

export const backend = () => (process.env.TEST_DATABASE_URL ? 'real PostgreSQL' : 'PGlite');
