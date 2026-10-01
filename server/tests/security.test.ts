import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Db } from '../db/adapter';
import { DEMO_STAFF, seedPractice, type SeededPractice } from '../db/seed';
import { backend, freshDb } from './helpers';

describe(`tenant isolation & database safety (${backend()})`, () => {
  let db: Db, A: SeededPractice, B: SeededPractice;
  before(async () => {
    db = await freshDb();
    A = await seedPractice(db, { name: 'Practice A', phone: '(555) 000-0001', staff: DEMO_STAFF });
    B = await seedPractice(db, { name: 'Practice B', phone: '(555) 000-0002', staff: [{ email: 'b@b.test', name: 'B Owner', role: 'owner' }] });
  });
  after(() => db.close());

  it('a practice sees only its own rows', async () => {
    const rows = await db.tenant(A.practiceId, (q) => q.query<{ practice_id: string }>('SELECT practice_id FROM patients'));
    assert.equal(rows.length, 6);
    assert.ok(rows.every((r) => r.practice_id === A.practiceId));
  });

  it('with no practice scope, the app role sees nothing (fails closed)', async () => {
    const n = await db.admin(async (q) => {
      await q.query('SET LOCAL ROLE plenire_app');
      return (await q.query('SELECT 1 FROM patients')).length;
    });
    assert.equal(n, 0);
  });

  it('cannot write a row into another practice', async () => {
    await assert.rejects(db.tenant(A.practiceId, (q) => q.query("INSERT INTO patients (practice_id, name) VALUES ($1, 'Intruder')", [B.practiceId])));
  });

  it('cannot update or delete another practice\'s rows', async () => {
    const victim = B.patients['Priya Shah'];
    const upd = await db.tenant(A.practiceId, (q) => q.query("UPDATE patients SET name = 'Hacked' WHERE id = $1 RETURNING id", [victim]));
    const del = await db.tenant(A.practiceId, (q) => q.query('DELETE FROM waitlist_entries WHERE patient_id = $1 RETURNING id', [victim]));
    assert.equal(upd.length + del.length, 0);
    const [still] = await db.tenant(B.practiceId, (q) => q.query<{ name: string }>('SELECT name FROM patients WHERE id = $1', [victim]));
    assert.equal(still.name, 'Priya Shah');
  });

  it('cannot link its data to another practice\'s patient or provider (composite foreign keys)', async () => {
    await assert.rejects(
      db.tenant(A.practiceId, (q) =>
        q.query(`INSERT INTO appointments (practice_id, patient_id, provider_id, starts_at, duration_min, treatment) VALUES ($1,$2,$3, now(), 30, 'x')`,
          [A.practiceId, B.patients['Priya Shah'], A.providers['Dr. Mensah']])),
    );
    await assert.rejects(
      db.tenant(A.practiceId, (q) =>
        q.query(`INSERT INTO appointments (practice_id, patient_id, provider_id, starts_at, duration_min, treatment) VALUES ($1,$2,$3, now(), 30, 'x')`,
          [A.practiceId, A.patients['Priya Shah'], B.providers['Dr. Mensah']])),
    );
  });

  it('rejects a malformed practice id before it reaches SQL', async () => {
    await assert.rejects(db.tenant("x'; DROP TABLE patients;--", async () => {}), /Invalid practice id/);
  });

  it('the app role cannot edit, delete or wipe the audit log', async () => {
    await db.tenant(A.practiceId, (q) => q.query("INSERT INTO audit_log (practice_id, actor_role, action, seq, at, prev_hash, hash) VALUES ($1,'system','TEST',0,now(),'','')", [A.practiceId]));
    await assert.rejects(db.tenant(A.practiceId, (q) => q.query("UPDATE audit_log SET action = 'EDITED'")));
    await assert.rejects(db.tenant(A.practiceId, (q) => q.query('DELETE FROM audit_log')));
    await assert.rejects(db.tenant(A.practiceId, (q) => q.query('TRUNCATE audit_log')));
  });

  it('the app role cannot read another practice\'s audit log', async () => {
    const rows = await db.tenant(B.practiceId, (q) => q.query('SELECT 1 FROM audit_log'));
    assert.equal(rows.length, 0);
  });
});
