import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../app';
import { localTokens, type LocalTokens } from '../auth/tokens';
import type { Db } from '../db/adapter';
import { seedDemo, seedPractice, type SeededPractice } from '../db/seed';
import type { MessageProvider } from '../services/messaging';
import { backend, freshDb } from './helpers';

describe(`endpoints behind the screens (${backend()})`, () => {
  let db: Db, A: SeededPractice, B: SeededPractice, dev: LocalTokens, app: ReturnType<typeof createApp>, fd: string, owner: string, bOwner: string;
  const provider: MessageProvider = { send: async () => {} };
  const call = async (method: string, path: string, tok: string, body?: unknown) => {
    const res = await app.request(path, { method, headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  };
  const tok = (P: SeededPractice, email: string) => dev.issue({ staffId: P.staff[email].id, practiceId: P.practiceId, role: P.staff[email].role });
  const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  before(async () => {
    db = await freshDb();
    A = await seedDemo(db);
    B = await seedPractice(db, { name: 'Other Dental', phone: '(555) 020-0200', staff: [{ email: 'b@b.test', name: 'B Owner', role: 'owner' }] });
    dev = localTokens('a-test-secret-that-is-at-least-32-characters-long');
    app = createApp({ db, verifier: dev, tokens: dev, provider, config: { CORS_ORIGINS: '', ENABLE_SIMULATOR: 'true' } });
    fd = await tok(A, 'tracy@lakeside.test');
    owner = await tok(A, 'mensah@lakeside.test');
    bOwner = await tok(B, 'b@b.test');
  });
  after(() => db.close());

  it('demo history gives the dashboards a real rate (34 of 52)', async () => {
    const r = await call('GET', '/api/metrics/recovery', fd);
    assert.equal(r.json.period.openings, 52);
    assert.equal(r.json.period.filled, 34);
    assert.equal(r.json.period.ratePercent, 65);
    assert.ok(r.json.weeks.length >= 4);
  });

  it('/me, /providers and summary numbers', async () => {
    const me = await call('GET', '/api/me', fd);
    assert.equal(me.json.name, 'Tracy R.');
    assert.equal(me.json.practice.timezone, 'America/Chicago');
    const pr = await call('GET', '/api/providers', fd);
    assert.equal(pr.json.length, 4);
    assert.ok(pr.json.every((p: any) => p.chair && p.title));
    const sum = await call('GET', '/api/patients/summary', fd);
    assert.deepEqual([sum.json.total, sum.json.consented], [6, 5]);
  });

  it('dollar figures on openings are owner-only (stripped on the server)', async () => {
    await call('PATCH', `/api/appointments/${A.appointments['Liam O\'Brien']}/status`, fd, { status: 'noshow' });
    const front = await call('GET', '/api/openings', fd);
    assert.ok(front.json.length >= 1);
    assert.ok(!/valueCents|estValueCents|cents/i.test(JSON.stringify(front.json)), 'front desk response has no money');
    const own = await call('GET', '/api/openings', owner);
    assert.equal(own.json[0].estValueCents, 28500, 'SRP fee from the practice fee schedule');
  });

  it('restoring a no-show closes its opening and withdraws offers', async () => {
    const id = A.appointments['Mia Coleman'];
    const ns = await call('PATCH', `/api/appointments/${id}/status`, fd, { status: 'noshow' });
    await call('POST', `/api/openings/${ns.json.openingId}/offers`, fd, { limit: 2 });
    const undo = await call('PATCH', `/api/appointments/${id}/status`, fd, { status: 'scheduled' });
    assert.equal(undo.status, 200);
    const list = await call('GET', '/api/openings', fd);
    assert.ok(!list.json.some((o: any) => o.id === ns.json.openingId), 'closed openings are not shown');
    const live = await db.tenant(A.practiceId, (q) => q.query("SELECT 1 FROM offers WHERE opening_id = $1 AND status = 'sent'", [ns.json.openingId]));
    assert.equal(live.length, 0);
  });

  it('completed visits are marked thanked; follow-ups can be set and cleared', async () => {
    const id = A.appointments['Isabella Flores'];
    await call('PATCH', `/api/appointments/${id}/status`, fd, { status: 'completed' });
    assert.equal((await call('PATCH', `/api/appointments/${id}/follow-up`, fd, { followUp: 'Call in 2 weeks' })).status, 200);
    let a = (await call('GET', '/api/appointments', fd)).json.find((x: any) => x.id === id);
    assert.deepEqual([a.thanked, a.followUp], [true, 'Call in 2 weeks']);
    await call('PATCH', `/api/appointments/${id}/follow-up`, fd, { followUp: null });
    a = (await call('GET', '/api/appointments', fd)).json.find((x: any) => x.id === id);
    assert.equal(a.followUp, null);
  });

  it('booking: creates patient + appointment, blocks double-booking, picks a free provider for "any"', async () => {
    const base = { firstName: 'Nora', lastName: 'Quinn', phone: '+15555550999', email: 'nora@example.com', newPatient: true, smsConsent: true, date: tomorrow(), time: '13:30', durationMin: 45, treatment: 'Cleaning & Checkup' };
    const mensah = (await call('GET', '/api/providers', fd)).json.find((p: any) => p.name === 'Dr. Mensah').id;
    const one = await call('POST', '/api/bookings', fd, { ...base, providerId: mensah });
    assert.equal(one.status, 201);
    assert.match(one.json.reference, /^PL-[0-9A-F]{8}$/);

    const clash = await call('POST', '/api/bookings', fd, { ...base, firstName: 'Other', providerId: mensah, time: '13:45' });
    assert.equal(clash.status, 409);
    assert.equal(clash.json.error.code, 'SLOT_TAKEN');

    const any = await call('POST', '/api/bookings', fd, { ...base, time: '13:30', providerId: null });
    assert.equal(any.status, 201);
    assert.notEqual(any.json.providerName, 'Dr. Mensah', 'any-provider skips the busy provider');
    assert.equal(any.json.patientId, one.json.patientId, 'same name + phone reuses the patient');

    const patients = (await call('GET', '/api/patients', fd)).json.filter((p: any) => p.name === 'Nora Quinn');
    assert.equal(patients.length, 1);
    assert.equal(patients[0].smsConsent, true);
  });

  it('booking cannot use another practice\'s provider', async () => {
    const bProvider = (await call('GET', '/api/providers', bOwner)).json[0].id;
    const r = await call('POST', '/api/bookings', fd, { firstName: 'A', lastName: 'B', phone: '+15555550111', newPatient: false, smsConsent: false, date: tomorrow(), time: '09:00', durationMin: 30, treatment: 'x', providerId: bProvider });
    assert.equal(r.status, 404);
  });

  it('walk-ins: add patient + appointment, conflicts refused', async () => {
    const pid = (await call('POST', '/api/patients', fd, { name: 'Walker In', smsConsent: false, walkIn: true })).json.patientId;
    const prov = (await call('GET', '/api/providers', fd)).json.find((p: any) => p.name === 'RDH Brooks').id;
    const startsAt = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const ok = await call('POST', '/api/appointments', fd, { patientId: pid, providerId: prov, startsAt, durationMin: 30, treatment: 'Walk-in', walkIn: true });
    assert.equal(ok.status, 201);
    const again = await call('POST', '/api/appointments', fd, { patientId: pid, providerId: prov, startsAt, durationMin: 30, treatment: 'Walk-in', walkIn: true });
    assert.equal(again.status, 409);
    assert.equal((await call('POST', '/api/patients', fd, { name: 'No Phone', smsConsent: true })).status, 422, 'consent needs a number');
  });

  it('inbox: unread counts, mark-read, compose with safeguards', async () => {
    const priya = A.patients['Priya Shah'];
    await call('POST', `/api/patients/${priya}/simulate-reply`, fd, { body: 'what time is it?' });
    let conv = (await call('GET', '/api/conversations', fd)).json.find((c: any) => c.patientId === priya);
    assert.equal(conv.unread, 1);
    await call('POST', `/api/patients/${priya}/messages/read`, fd);
    conv = (await call('GET', '/api/conversations', fd)).json.find((c: any) => c.patientId === priya);
    assert.equal(conv.unread, 0);

    const phi = await call('POST', `/api/patients/${priya}/messages`, fd, { body: 'Your root canal follow-up is due' });
    assert.equal(phi.status, 422);
    assert.equal(phi.json.error.code, 'PHI_IN_MESSAGE');
    const noConsent = await call('POST', `/api/patients/${A.patients['Hannah Cho']}/messages`, fd, { body: 'Hello' });
    assert.equal(noConsent.json.error.code, 'NO_SMS_CONSENT');
    assert.equal((await call('POST', `/api/patients/${priya}/messages`, fd, { body: 'See you Thursday!' })).status, 201);
    const thread = (await call('GET', `/api/messages?patientId=${priya}`, fd)).json;
    assert.ok(thread.some((m: any) => m.direction === 'out' && m.body === 'See you Thursday!' && m.status === 'sent'));
  });

  it('other practices cannot see this inbox', async () => {
    assert.deepEqual((await call('GET', '/api/conversations', bOwner)).json, []);
  });

  it('browser can log only whitelisted workstation events', async () => {
    assert.equal((await call('POST', '/api/audit/events', fd, { action: 'WORKSTATION_LOCK' })).status, 201);
    assert.equal((await call('POST', '/api/audit/events', fd, { action: 'SLOT_FILLED' })).status, 422, 'cannot forge business events');
    assert.equal((await call('POST', '/api/audit/events', fd, { action: 'WORKSTATION_LOCK', details: 'x' })).status, 201);
    const log = (await call('GET', '/api/audit', owner)).json;
    assert.ok(log.some((e: any) => e.action === 'WORKSTATION_LOCK'));
    assert.deepEqual((await call('GET', '/api/audit/verify', owner)).json, { intact: true, firstBrokenSeq: null });
  });
});
