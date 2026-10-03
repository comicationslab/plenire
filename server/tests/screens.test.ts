import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../app';
import { localTokens, type LocalTokens } from '../auth/tokens';
import type { Db } from '../db/adapter';
import { DEMO_PASSWORD, seedDemo, seedPractice, type SeededPractice } from '../db/seed';
import type { MessageProvider } from '../services/messaging';
import { queueReminders } from '../services/notifications';
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
    // Open every provider 6:00 to 20:00, every day, so the other tests do not depend on which weekday they run on.
    for (const p of (await call('GET', '/api/providers', owner)).json) await openAllWeek(p.id);
  });
  const openAllWeek = (providerId: string) =>
    call('PUT', `/api/providers/${providerId}/hours`, owner, { hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMin: 360, endMin: 1200 })) });
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

  it('completed visits can be marked; follow-ups can be set and cleared', async () => {
    const id = A.appointments['Isabella Flores'];
    await call('PATCH', `/api/appointments/${id}/status`, fd, { status: 'completed' });
    assert.equal((await call('PATCH', `/api/appointments/${id}/follow-up`, fd, { followUp: 'Call in 2 weeks' })).status, 200);
    let a = (await call('GET', '/api/appointments', fd)).json.find((x: any) => x.id === id);
    assert.equal(a.followUp, 'Call in 2 weeks');
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

  it('booking: saves the chosen insurance plan or self-pay on the appointment', async () => {
    const base = { firstName: 'Ines', lastName: 'Park', phone: '+15555550777', newPatient: true, smsConsent: true, date: tomorrow(), durationMin: 30, treatment: 'Cleaning & Checkup', providerId: null };
    const insured = await call('POST', '/api/bookings', fd, { ...base, time: '09:00', insurancePlan: 'Delta Dental PPO' });
    const selfPay = await call('POST', '/api/bookings', fd, { ...base, firstName: 'Sol', time: '10:00', selfPay: true, insurancePlan: 'ignored when self-pay' });
    const skipped = await call('POST', '/api/bookings', fd, { ...base, firstName: 'Max', time: '11:00' });
    assert.deepEqual([insured.status, selfPay.status, skipped.status], [201, 201, 201]);
    const rows = await db.admin((q) => q.query<any>('SELECT id, insurance_plan, self_pay FROM appointments WHERE id = ANY($1::uuid[])', [[insured.json.appointmentId, selfPay.json.appointmentId, skipped.json.appointmentId]]));
    const by = (id: string) => rows.find((r: any) => r.id === id);
    assert.deepEqual([by(insured.json.appointmentId).insurance_plan, by(insured.json.appointmentId).self_pay], ['Delta Dental PPO', false]);
    assert.deepEqual([by(selfPay.json.appointmentId).insurance_plan, by(selfPay.json.appointmentId).self_pay], [null, true]);
    assert.deepEqual([by(skipped.json.appointmentId).insurance_plan, by(skipped.json.appointmentId).self_pay], [null, false]);
    assert.equal((await call('POST', '/api/bookings', fd, { ...base, time: '11:30', insurancePlan: 'x'.repeat(121) })).status, 422, 'plan name is length-limited');
  });

  describe('automatic patient texts', () => {
    const thread = async (patientId: string) => (await call('GET', `/api/messages?patientId=${patientId}`, fd)).json.filter((m: any) => m.direction === 'out');
    const mk = async (name: string, smsConsent: boolean) =>
      (await call('POST', '/api/patients', fd, { name, phone: `+1555555${String(Math.floor(1000 + Math.random() * 8999))}`, smsConsent })).json.patientId as string;
    const provider = async () => (await call('GET', '/api/providers', fd)).json[0].id as string;
    const insertAppt = (patientId: string, providerId: string, hoursAhead: number, bookedDaysAgo: number) =>
      db.admin((q) => q.query<{ id: string }>(
        `INSERT INTO appointments (practice_id, patient_id, provider_id, starts_at, duration_min, treatment, created_at)
         VALUES ($1,$2,$3, now() + make_interval(hours => $4), 30, 'Cleaning & Checkup', now() - make_interval(days => $5)) RETURNING id`,
        [A.practiceId, patientId, providerId, hoursAhead, bookedDaysAgo])).then((r) => r[0].id);
    const book = (p: any) => call('POST', '/api/bookings', fd, { firstName: 'Cora', lastName: p.last, phone: p.phone, newPatient: true, smsConsent: p.consent, date: tomorrow(), time: p.time, durationMin: 30, treatment: 'Cleaning & Checkup', providerId: null });

    it('booking sends a confirmation that shows up in Messages; no consent = no text, booking still works', async () => {
      const yes = await book({ last: 'Texted', phone: '+15555551001', consent: true, time: '09:00' });
      assert.equal(yes.status, 201);
      const t = await thread(yes.json.patientId);
      assert.equal(t.length, 1);
      assert.match(t[0].body, /^Hi Cora, you're booked at .+ on \w{3}, \w{3} \d+ at \d+:\d{2} [AP]M\./);
      assert.match(t[0].body, /Reply STOP to opt out\.$/);
      assert.equal(t[0].status, 'sent', 'delivered through the outbox straight away');
      assert.doesNotMatch(t[0].body, /Cleaning/i, 'no treatment in the text');

      const no = await book({ last: 'Silent', phone: '+15555551002', consent: false, time: '09:30' });
      assert.equal(no.status, 201);
      assert.equal((await thread(no.json.patientId)).length, 0);
    });

    it('Seen sends the thank-you with the review link exactly once, and marks it thanked', async () => {
      assert.equal((await call('PATCH', '/api/practice/settings', owner, { googleReviewUrl: 'https://g.page/r/demo/review', reminderHours: [24, 2] })).status, 200);
      assert.equal((await call('PATCH', '/api/practice/settings', fd, { googleReviewUrl: null, reminderHours: [] })).status, 403, 'owner only');
      assert.equal((await call('PATCH', '/api/practice/settings', owner, { googleReviewUrl: 'http://insecure.example', reminderHours: [24] })).status, 422, 'https only');
      const pid = await mk('Thea Seen', true);
      const appt = await insertAppt(pid, await provider(), 3, 1);
      const r1 = await call('PATCH', `/api/appointments/${appt}/status`, fd, { status: 'completed' });
      assert.equal(r1.json.thanked, true);
      let t = await thread(pid);
      assert.equal(t.length, 1);
      assert.match(t[0].body, /Thanks for visiting .+, Thea! .*https:\/\/g\.page\/r\/demo\/review/);
      assert.equal((await call('GET', '/api/appointments', fd)).json.find((x: any) => x.id === appt).thanked, true);
      await call('PATCH', `/api/appointments/${appt}/status`, fd, { status: 'arrived' });
      await call('PATCH', `/api/appointments/${appt}/status`, fd, { status: 'completed' });
      t = await thread(pid);
      assert.equal(t.length, 1, 'toggling Seen again does not text twice');
    });

    it('thank-you without consent is not sent and the visit is not marked thanked', async () => {
      const pid = await mk('Nico Nope', false);
      const appt = await insertAppt(pid, await provider(), 3, 1);
      const r = await call('PATCH', `/api/appointments/${appt}/status`, fd, { status: 'completed' });
      assert.equal(r.status, 200);
      assert.equal(r.json.thanked, false);
      assert.equal((await thread(pid)).length, 0);
    });

    it('setting a follow-up sends a confirmation with timing only (no clinical wording), not on repeat or clear', async () => {
      const pid = await mk('Fern Follow', true);
      const appt = await insertAppt(pid, await provider(), 48, 1);
      await call('PATCH', `/api/appointments/${appt}/follow-up`, fd, { followUp: '3-month perio maintenance' });
      let t = await thread(pid);
      assert.equal(t.length, 1);
      assert.match(t[0].body, /Your next visit is due in about 3 months\./);
      assert.doesNotMatch(t[0].body, /perio/i);
      await call('PATCH', `/api/appointments/${appt}/follow-up`, fd, { followUp: '3-month perio maintenance' });
      await call('PATCH', `/api/appointments/${appt}/follow-up`, fd, { followUp: null });
      assert.equal((await thread(pid)).length, 1, 'same text and clearing do not text again');
      await call('PATCH', `/api/appointments/${appt}/follow-up`, fd, { followUp: 'Custom · Nov 4 · 2:30 PM' });
      t = await thread(pid);
      assert.equal(t.length, 2);
      assert.match(t[1].body, /follow-up visit is set for Nov 4 at 2:30 PM\./);
    });

    it('reminders: due visits get one text each; late bookings, other statuses and opted-out patients do not', async () => {
      const prov = await provider();
      const due = await mk('Dana Due', true);
      const lateBooked = await mk('Lee Late', true);
      const far = await mk('Finn Far', true);
      const done = await mk('Cal Done', true);
      const optedOut = await mk('Opt Out', false);
      const a = await insertAppt(due, prov, 23, 2);           // 23h away, booked 2 days ago → inside the 24h window
      await insertAppt(lateBooked, prov, 23, 0);              // booked just now, inside the window → confirmation already covers it
      await insertAppt(far, prov, 60, 3);                     // 60h away → not yet
      const c = await insertAppt(done, prov, 23, 2);
      await db.admin((q) => q.query("UPDATE appointments SET status = 'cancelled' WHERE id = $1", [c]));
      await insertAppt(optedOut, prov, 23, 2);
      await insertAppt(await mk('Stu Stale', true), prov, 10, 2);   // 24h reminder window passed hours ago → no stale reminder

      const run1 = await queueReminders(db, A.practiceId);
      assert.equal(run1.queued, 1);
      const t = await thread(due);
      assert.equal(t.length, 1);
      assert.match(t[0].body, /reminder from .+: your appointment is \w{3}, \w{3} \d+ at \d+:\d{2} [AP]M\./);
      for (const p of [lateBooked, far, done, optedOut]) assert.equal((await thread(p)).length, 0);
      assert.equal(run1.queued, 1, 'the stale 10h visit got nothing either');

      assert.equal((await queueReminders(db, A.practiceId)).queued, 0, 'running again never repeats a reminder');
      const ledger = await db.admin((q) => q.query<any>('SELECT kind FROM appointment_notifications WHERE appointment_id = $1', [a]));
      assert.deepEqual(ledger.map((r: any) => r.kind), ['reminder_24h']);

      await db.admin((q) => q.query("UPDATE appointments SET starts_at = now() + interval '1 hour 30 minutes' WHERE id = $1", [a]));
      assert.equal((await queueReminders(db, A.practiceId)).queued, 1, 'the 2-hour reminder is separate from the 24-hour one');
    });
  });

  describe('working hours per provider', () => {
    const nextMonday = (plusDays = 0) => {
      const d = new Date(); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7) + plusDays);
      return d.toISOString().slice(0, 10);
    };
    const book = (date: string, time: string, providerId: string | null, last: string) =>
      call('POST', '/api/bookings', fd, { firstName: 'Hana', lastName: last, phone: '+15555552' + String(Math.floor(100 + Math.random() * 899)), newPatient: true, smsConsent: false, date, time, durationMin: 30, treatment: 'Cleaning & Checkup', providerId });

    it('the owner sets hours; bookings outside them are refused, inside them work; only owners can change hours', async () => {
      const prov = (await call('GET', '/api/providers', owner)).json.at(-1).id as string;
      const mon = nextMonday(7);
      assert.equal((await call('PUT', `/api/providers/${prov}/hours`, fd, { hours: [{ weekday: 1, startMin: 600, endMin: 720 }] })).status, 403, 'front desk cannot');
      assert.equal((await call('PUT', `/api/providers/${prov}/hours`, owner, { hours: [{ weekday: 1, startMin: 600, endMin: 720 }] })).status, 200);
      const listed = (await call('GET', '/api/providers', fd)).json.find((p: any) => p.id === prov);
      assert.deepEqual(listed.hours, [{ weekday: 1, startMin: 600, endMin: 720 }]);

      assert.equal((await book(mon, '09:30', prov, 'Early')).json.error.code, 'OUTSIDE_HOURS');
      assert.equal((await book(mon, '11:45', prov, 'Late')).json.error.code, 'OUTSIDE_HOURS', 'a visit that would run past closing is refused');
      assert.equal((await book(nextMonday(8), '10:30', prov, 'DayOff')).json.error.code, 'OUTSIDE_HOURS', 'Tuesday is a day off');
      assert.equal((await book(mon, '10:00', prov, 'Inside')).status, 201);
      assert.equal((await book(mon, '11:30', prov, 'LastSlot')).status, 201, 'ends exactly at closing');

      const patient = (await call('POST', '/api/patients', fd, { name: 'Walk Inn', phone: '+15555552999' })).json.patientId;
      const at = (hh: string) => `${mon}T${hh}:00-05:00`;
      const staffSched = await call('POST', '/api/appointments', fd, { patientId: patient, providerId: prov, startsAt: at('08:00'), durationMin: 30, treatment: 'Exam' });
      assert.equal(staffSched.json.error.code, 'OUTSIDE_HOURS', 'scheduled visits follow the hours too');
      const walkIn = await call('POST', '/api/appointments', fd, { patientId: patient, providerId: prov, startsAt: at('08:00'), durationMin: 30, treatment: 'Emergency exam', walkIn: true });
      assert.equal(walkIn.status, 201, 'a walk-in is already in the chair');

      assert.equal((await call('PUT', `/api/providers/${prov}/hours`, owner, { hours: [{ weekday: 1, startMin: 720, endMin: 720 }] })).status, 422, 'closing must be after opening');
      assert.equal((await call('PUT', `/api/providers/${prov}/hours`, owner, { hours: [] })).status, 422, 'at least one working day');
      assert.equal((await call('PUT', `/api/providers/${prov}/hours`, owner, { hours: [{ weekday: 1, startMin: 601, endMin: 720 }] })).status, 422, '15-minute steps');
      assert.equal((await call('PUT', `/api/providers/${prov}/hours`, bOwner, { hours: [{ weekday: 1, startMin: 600, endMin: 720 }] })).status, 404, 'another practice cannot touch it');
      await openAllWeek(prov);
    });

    it('"any provider" only picks someone who is working; a provider with no hours set uses Monday to Saturday 9 to 5', async () => {
      const provs = (await call('GET', '/api/providers', owner)).json.filter((p: any) => p.chair) as { id: string }[];
      const mon = nextMonday(14);
      for (const p of provs.slice(1)) await call('PUT', `/api/providers/${p.id}/hours`, owner, { hours: [{ weekday: 3, startMin: 540, endMin: 600 }] }); // only Wednesdays 9-10
      const r = await book(mon, '14:00', null, 'AnyOne');
      assert.equal(r.status, 201);
      const picked = (await db.admin((q) => q.query<any>('SELECT provider_id FROM appointments WHERE id = $1', [r.json.appointmentId])))[0].provider_id;
      assert.equal(picked, provs[0].id, 'the only chair open on Monday afternoon');
      for (const p of provs.slice(1)) assert.ok((await book(mon, '14:30', p.id, 'Nope')).json.error.code === 'OUTSIDE_HOURS');
      for (const p of provs) await openAllWeek(p.id);

      await db.admin((q) => q.query('DELETE FROM provider_hours WHERE provider_id = $1', [provs[0].id]));
      const def = (await call('GET', '/api/providers', owner)).json.find((p: any) => p.id === provs[0].id);
      assert.deepEqual(def.hours, [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMin: 540, endMin: 1020 })), 'nothing stored: the API shows the default so Settings can display it');
      assert.equal((await book(mon, '08:30', provs[0].id, 'DefaultEarly')).json.error.code, 'OUTSIDE_HOURS');
      assert.equal((await book(mon, '16:30', provs[0].id, 'DefaultOk')).status, 201);
      await openAllWeek(provs[0].id);
    });
  });

  describe('patient cards', () => {
    const pw = DEMO_PASSWORD;
    let pid: string;
    it('anyone on the team can open a card (and it is logged); editing needs the person\'s own password', async () => {
      pid = (await call('POST', '/api/patients', fd, { name: 'Pia Card', phone: '+15555553001', email: 'pia@example.com', smsConsent: true, notes: 'Prefers mornings' })).json.patientId;
      const card = await call('GET', `/api/patients/${pid}`, fd);
      assert.equal(card.status, 200);
      assert.equal(card.json.name, 'Pia Card');
      assert.ok(Array.isArray(card.json.appointments));
      const viewed = await db.admin((q) => q.query<any>("SELECT details FROM audit_log WHERE action = 'PATIENT_VIEWED' AND details->>'patientId' = $1", [pid]));
      assert.equal(viewed.length, 1);
      assert.equal((await call('GET', `/api/patients/${pid}`, bOwner)).status, 404, 'other practices cannot open it');

      const edit = (tok: string, body: any) => call('PATCH', `/api/patients/${pid}`, tok, body);
      assert.equal((await edit(fd, { name: 'Pia Changed' })).json.error.code, 'PASSWORD_REQUIRED');
      assert.equal((await edit(fd, { name: 'Pia Changed', password: 'wrong-password-123' })).json.error.code, 'WRONG_PASSWORD');
      assert.equal((await call('GET', `/api/patients/${pid}`, fd)).json.name, 'Pia Card', 'refused edits changed nothing');
      const ok = await edit(owner, { name: 'Pia Changed', notes: 'Prefers afternoons', password: pw });
      assert.equal(ok.status, 200, 'owner with own password');
      assert.deepEqual([ok.json.changed, ok.json.consentReset], [['name', 'notes'], false]);
      const after = (await call('GET', `/api/patients/${pid}`, fd)).json;
      assert.deepEqual([after.name, after.notes, after.smsConsent], ['Pia Changed', 'Prefers afternoons', true]);
      assert.ok(after.updatedAt);
    });

    it('the activity log records which fields changed, never the values; no-op saves are not logged', async () => {
      const rows = await db.admin((q) => q.query<any>("SELECT details FROM audit_log WHERE action = 'PATIENT_UPDATED' AND details->>'patientId' = $1", [pid]));
      assert.equal(rows.length, 1);
      assert.deepEqual(rows[0].details.fields, ['name', 'notes']);
      assert.doesNotMatch(JSON.stringify(rows[0].details), /Pia|afternoons/);
      const same = await call('PATCH', `/api/patients/${pid}`, owner, { name: 'Pia Changed', password: pw });
      assert.deepEqual(same.json.changed, []);
      assert.equal((await db.admin((q) => q.query<any>("SELECT 1 FROM audit_log WHERE action = 'PATIENT_UPDATED' AND details->>'patientId' = $1", [pid]))).length, 1);
    });

    it('a new phone number turns texting off until the patient agrees again; email can be cleared', async () => {
      const r = await call('PATCH', `/api/patients/${pid}`, owner, { phone: '+15555553002', email: '', password: pw });
      assert.deepEqual([r.json.changed, r.json.consentReset], [['phone', 'email'], true]);
      const c = (await call('GET', `/api/patients/${pid}`, owner)).json;
      assert.deepEqual([c.phone, c.email, c.smsConsent, c.smsConsentAt], ['+15555553002', null, false, null]);
      assert.equal((await call('POST', `/api/patients/${pid}/messages`, owner, { body: 'Hello there' })).status, 422, 'cannot text without consent');
    });

    it('insurance: booking records the patient\'s current plan; the card shows it; editing needs the password and is logged by field name only', async () => {
      const mon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      const book = (time: string, extra: object) => call('POST', '/api/bookings', fd, { firstName: 'Iris', lastName: 'Cover', phone: '+15555554001', newPatient: true, smsConsent: false, date: mon, time, durationMin: 30, treatment: 'Cleaning & Checkup', providerId: null, ...extra });
      const first = await book('09:00', { insurancePlan: 'Delta Dental PPO' });
      assert.equal(first.status, 201);
      const id = first.json.patientId as string;
      const card = async () => (await call('GET', `/api/patients/${id}`, fd)).json;
      assert.deepEqual([(await card()).insurancePlan, (await card()).selfPay], ['Delta Dental PPO', false]);

      await book('10:00', {});   // booking again without answering keeps what is on file
      assert.equal((await card()).insurancePlan, 'Delta Dental PPO');
      await book('11:00', { selfPay: true });
      assert.deepEqual([(await card()).insurancePlan, (await card()).selfPay], [null, true], 'a newer answer replaces it');

      const edit = (tok: string, body: any) => call('PATCH', `/api/patients/${id}`, tok, body);
      assert.equal((await edit(owner, { insurance: { kind: 'plan', name: 'Cigna Dental' } })).json.error.code, 'PASSWORD_REQUIRED');
      assert.equal((await card()).selfPay, true, 'refused edit changed nothing');
      const ok = await edit(owner, { insurance: { kind: 'plan', name: 'Cigna Dental' }, password: pw });
      assert.deepEqual(ok.json.changed, ['insurance']);
      assert.deepEqual([(await card()).insurancePlan, (await card()).selfPay], ['Cigna Dental', false]);

      const typed = await edit(owner, { insurance: { kind: 'plan', name: 'Local Union Dental Trust' }, password: pw });
      assert.deepEqual(typed.json.changed, ['insurance'], 'a plan that is not in the list can be typed');
      assert.equal((await edit(owner, { insurance: { kind: 'plan', name: 'Local Union Dental Trust' }, password: pw })).json.changed.length, 0, 'same plan = no change');
      assert.equal((await edit(owner, { insurance: { kind: 'plan', name: '   ' }, password: pw })).status, 422);
      assert.equal((await edit(owner, { insurance: { kind: 'plan', name: 'x'.repeat(121) }, password: pw })).status, 422);
      assert.equal((await edit(owner, { name: 'Iris Cover', password: pw })).json.changed.length, 0, 'leaving insurance out leaves it alone');
      assert.equal((await card()).insurancePlan, 'Local Union Dental Trust');
      assert.ok((await edit(owner, { insurance: null, password: pw })).json.changed.includes('insurance'));
      assert.deepEqual([(await card()).insurancePlan, (await card()).selfPay], [null, false], 'cleared');

      const logs = await db.admin((q) => q.query<any>("SELECT details FROM audit_log WHERE action = 'PATIENT_UPDATED' AND details->>'patientId' = $1", [id]));
      assert.ok(logs.length >= 3);
      assert.ok(logs.every((l: any) => l.details.fields.includes('insurance')));
      assert.doesNotMatch(JSON.stringify(logs), /Cigna|Union|Delta/, 'the log never contains the plan name');
    });

    it('five wrong passwords lock confirmations for a while (a borrowed signed-in screen cannot guess the password)', async () => {
      // (this person already got one wrong password earlier in these tests; the count is shared with sign-in)
      const codes: string[] = [];
      for (let i = 0; i < 5; i++) codes.push((await call('PATCH', `/api/patients/${pid}`, fd, { name: 'X', password: `wrong-guess-${i}-xyz` })).json.error.code);
      assert.equal(codes.at(-1), 'LOCKED');
      assert.ok(codes.slice(0, -1).every((c) => c === 'WRONG_PASSWORD'));
      const locked = await call('PATCH', `/api/patients/${pid}`, fd, { name: 'X', password: pw });
      assert.equal(locked.status, 429, 'even the right password is refused while locked');
      assert.equal((await call('GET', `/api/patients/${pid}`, fd)).json.name, 'Pia Changed');
    });
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
