import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { detectEPHI } from '../../shared/phi';
import type { Db, Queryable } from '../db/adapter';
import { DEMO_STAFF, seedPractice, type SeededPractice } from '../db/seed';
import { SYSTEM, type Ctx } from '../services/audit';
import { dispatchOutbox, queueMessage, type MessageProvider } from '../services/messaging';
import { recoveryRate, revenueRecovered } from '../services/metrics';
import { acceptOffer, expireOffers, handleReply, sendOffers, setAppointmentStatus } from '../services/recovery';
import { backend, freshDb } from './helpers';

describe(`recovery engine (${backend()})`, () => {
  let db: Db, P: SeededPractice, ctx: Ctx;
  const t = <T>(fn: (q: Queryable) => Promise<T>) => db.tenant(P.practiceId, fn);

  beforeEach(async () => {
    db = await freshDb();
    P = await seedPractice(db, { name: 'Lakeside Dental', phone: '(555) 010-0100', staff: DEMO_STAFF });
    ctx = { practiceId: P.practiceId, actorId: P.staff['tracy@lakeside.test'].id, role: 'front_desk' };
  });
  after(async () => db?.close());

  const noShow = (name: string) => t((q) => setAppointmentStatus(q, ctx, P.appointments[name], 'noshow'));
  const openingStatus = (id: string) => t(async (q) => (await q.query<{ status: string }>('SELECT status FROM openings WHERE id=$1', [id]))[0].status);

  it('a no-show creates exactly one opening, even if marked twice', async () => {
    const a = await noShow('Isabella Flores');
    const b = await noShow('Isabella Flores');
    assert.ok(a.openingId);
    assert.equal(b.openingId, null);
    assert.equal((await t((q) => q.query('SELECT 1 FROM openings'))).length, 1);
  });

  it('offers go only to consenting waitlisted patients, best match first, never the original patient', async () => {
    const { openingId } = await noShow('Isabella Flores'); // Crown prep #19 with Dr. Mensah
    const one = await t((q) => sendOffers(q, ctx, openingId!, { limit: 1 }));
    assert.equal(one.offered, 1);
    const [first] = await t((q) => q.query<{ patient_id: string }>('SELECT patient_id FROM offers'));
    assert.equal(first.patient_id, P.patients['Priya Shah'], 'crown + preferred provider + high urgency ranks first');

    await t((q) => sendOffers(q, ctx, openingId!, { limit: 10 }));
    const ids = (await t((q) => q.query<{ patient_id: string }>('SELECT patient_id FROM offers'))).map((r) => r.patient_id);
    assert.ok(!ids.includes(P.patients['Hannah Cho']), 'no consent -> never texted');
    assert.ok(!ids.includes(P.patients['Isabella Flores']), 'original patient is not offered their own slot');
    assert.equal(new Set(ids).size, ids.length, 'nobody is offered the same slot twice');
  });

  it('offer texts contain no health details', async () => {
    const { openingId } = await noShow('Isabella Flores');
    await t((q) => sendOffers(q, ctx, openingId!));
    const bodies = await t((q) => q.query<{ body: string }>("SELECT body FROM messages WHERE direction='out'"));
    assert.ok(bodies.length >= 1);
    for (const m of bodies) {
      assert.equal(detectEPHI(m.body).hasEPHI, false);
      assert.ok(!/crown/i.test(m.body));
      assert.ok(/STOP/.test(m.body), 'every offer carries opt-out wording');
    }
  });

  it('the server refuses to queue a text with health wording', async () => {
    await assert.rejects(t((q) => queueMessage(q, ctx, P.patients['Priya Shah'], 'Your root canal is ready')), /Message mentions health details/);
  });

  it('refuses to text a patient without consent', async () => {
    await assert.rejects(t((q) => queueMessage(q, ctx, P.patients['Hannah Cho'], 'Hello there')), /NO_SMS_CONSENT/);
  });

  it('YES books the slot, records fee value, withdraws other offers and removes the patient from the waitlist', async () => {
    const { openingId } = await noShow('Isabella Flores');
    await t((q) => sendOffers(q, ctx, openingId!, { limit: 5 }));
    const r = await t((q) => handleReply(q, ctx, P.patients['Priya Shah'], 'yes please'));
    assert.equal(r.outcome, 'booked');

    const [op] = await t((q) => q.query<any>('SELECT status, filled_by_patient_id, value_cents FROM openings WHERE id=$1', [openingId]));
    assert.equal(op.status, 'filled');
    assert.equal(op.filled_by_patient_id, P.patients['Priya Shah']);
    assert.equal(op.value_cents, 115000, 'crown fee from this practice\'s own fee schedule');
    const live = await t((q) => q.query("SELECT 1 FROM offers WHERE status='sent'"));
    assert.equal(live.length, 0);
    const wl = await t((q) => q.query('SELECT 1 FROM waitlist_entries WHERE patient_id=$1', [P.patients['Priya Shah']]));
    assert.equal(wl.length, 0);
    const appts = await t((q) => q.query('SELECT 1 FROM appointments WHERE patient_id=$1', [P.patients['Priya Shah']]));
    assert.equal(appts.length, 1);
  });

  it('when several patients answer YES at the same moment, exactly one gets the slot', async () => {
    // add 4 more consenting waitlisted patients so 5 offers are live
    await t(async (q) => {
      for (let i = 0; i < 4; i++) {
        const [p] = await q.query<{ id: string }>("INSERT INTO patients (practice_id, name, phone, sms_consent, sms_consent_at) VALUES ($1,$2,$3,true,now()) RETURNING id", [P.practiceId, `Racer ${i}`, `+1555555020${i}`]);
        await q.query("INSERT INTO waitlist_entries (practice_id, patient_id, treatments) VALUES ($1,$2,'{crown}')", [P.practiceId, p.id]);
      }
    });
    const { openingId } = await noShow('Isabella Flores');
    await t((q) => sendOffers(q, ctx, openingId!, { limit: 5 }));
    const offers = await t((q) => q.query<{ id: string }>("SELECT id FROM offers WHERE status='sent'"));
    assert.equal(offers.length, 5);

    const results = await Promise.all(offers.map((o) => t((q) => acceptOffer(q, ctx, o.id))));
    assert.equal(results.filter((r) => r.filled).length, 1, 'exactly one winner');
    assert.equal(results.filter((r) => !r.filled && r.reason === 'taken').length, 4);
    const booked = await t((q) => q.query('SELECT 1 FROM appointments WHERE starts_at = (SELECT starts_at FROM openings) AND provider_id = (SELECT provider_id FROM openings) AND status = \'scheduled\' AND patient_id <> $1', [P.patients['Isabella Flores']]));
    assert.equal(booked.length, 1, 'only one new appointment exists for the slot');
  });

  it('an expired offer cannot be accepted, and the sweeper reopens the slot', async () => {
    const { openingId } = await noShow('Isabella Flores');
    await t((q) => sendOffers(q, ctx, openingId!, { limit: 1, ttlMinutes: 15 }));
    assert.equal(await openingStatus(openingId!), 'offered');
    await t((q) => q.query("UPDATE offers SET expires_at = now() - interval '1 minute'"));

    const r = await t((q) => handleReply(q, ctx, P.patients['Priya Shah'], 'YES'));
    assert.equal(r.outcome, 'offer_unavailable');
    assert.equal(await openingStatus(openingId!), 'offered', 'not filled by a late YES');

    const swept = await expireOffers(db, P.practiceId);
    assert.equal(swept.reopened, 1);
    assert.equal(await openingStatus(openingId!), 'open');
  });

  it('STOP opts the patient out at once: offers withdrawn, no further texts, audit entry written', async () => {
    const { openingId } = await noShow('Isabella Flores');
    await t((q) => sendOffers(q, ctx, openingId!, { limit: 5 }));
    const r = await t((q) => handleReply(q, ctx, P.patients['Tyler Green'], 'Stop'));
    assert.equal(r.outcome, 'opted_out');

    const [pt] = await t((q) => q.query<any>('SELECT sms_consent, sms_opt_out_at FROM patients WHERE id=$1', [P.patients['Tyler Green']]));
    assert.equal(pt.sms_consent, false);
    assert.ok(pt.sms_opt_out_at);
    const [tylerOffer] = await t((q) => q.query<any>('SELECT status FROM offers WHERE patient_id=$1', [P.patients['Tyler Green']]));
    assert.equal(tylerOffer.status, 'withdrawn');
    assert.equal((await t((q) => q.query("SELECT 1 FROM audit_log WHERE action='TCPA_STOP'"))).length, 1);

    // a later opening never goes to Tyler
    const second = await noShow('Mia Coleman');
    await t((q) => sendOffers(q, ctx, second.openingId!, { limit: 10 }));
    const toTyler = await t((q) => q.query('SELECT 1 FROM offers WHERE opening_id=$1 AND patient_id=$2', [second.openingId, P.patients['Tyler Green']]));
    assert.equal(toTyler.length, 0);
    // and START brings them back
    assert.equal((await t((q) => handleReply(q, ctx, P.patients['Tyler Green'], 'START'))).outcome, 'opted_in');
  });

  it('HELP and unknown replies are handled; NO declines and keeps the patient on the waitlist', async () => {
    const { openingId } = await noShow('Isabella Flores');
    await t((q) => sendOffers(q, ctx, openingId!, { limit: 5 }));
    assert.equal((await t((q) => handleReply(q, ctx, P.patients['Priya Shah'], 'HELP'))).outcome, 'help');
    assert.equal((await t((q) => handleReply(q, ctx, P.patients['Priya Shah'], 'what time is it?'))).outcome, 'needs_staff');
    assert.equal((await t((q) => handleReply(q, ctx, P.patients['Priya Shah'], 'no thanks'))).outcome, 'declined');
    assert.equal((await t((q) => q.query('SELECT 1 FROM waitlist_entries WHERE patient_id=$1', [P.patients['Priya Shah']]))).length, 1);
  });

  it('outbox: queued texts are sent once; a failing provider marks them failed instead of losing them', async () => {
    const { openingId } = await noShow('Isabella Flores');
    await t((q) => sendOffers(q, ctx, openingId!, { limit: 2 }));
    const sentTo: string[] = [];
    const good: MessageProvider = { send: async (to) => void sentTo.push(to) };
    const r1 = await dispatchOutbox(db, P.practiceId, good);
    assert.equal(r1.sent, 2);
    const r2 = await dispatchOutbox(db, P.practiceId, good);
    assert.equal(r2.sent, 0, 'never sent twice');

    await t((q) => handleReply(q, ctx, P.patients['Priya Shah'], 'HELP'));
    const bad: MessageProvider = { send: async () => { throw new Error('carrier down'); } };
    assert.equal((await dispatchOutbox(db, P.practiceId, bad)).failed, 1);
  });

  it('audit log never contains patient names or message text, and the chain verifies', async () => {
    const { openingId } = await noShow('Isabella Flores');
    await t((q) => sendOffers(q, ctx, openingId!));
    await t((q) => handleReply(q, ctx, P.patients['Priya Shah'], 'YES'));
    const rows = await t((q) => q.query<{ details: unknown }>('SELECT details FROM audit_log'));
    const blob = JSON.stringify(rows);
    for (const secret of ['Priya', 'Isabella', 'Tyler', 'Crown', '+1555']) assert.ok(!blob.includes(secret), `audit leaked ${secret}`);
    const [v] = await t((q) => q.query<{ broken: string | null }>('SELECT audit_verify($1) AS broken', [P.practiceId]));
    assert.equal(v.broken, null);
  });

  it('tampering with the audit log is detected', async () => {
    await noShow('Isabella Flores');
    await noShow('Mia Coleman');
    await t((q) => handleReply(q, ctx, P.patients['Priya Shah'], 'HELP'));
    // simulate an attacker with full database-owner access editing history
    await db.admin(async (q) => {
      await q.query('ALTER TABLE audit_log DISABLE TRIGGER audit_block_upd');
      await q.query("UPDATE audit_log SET action = 'NOTHING_HAPPENED' WHERE seq = 2");
    });
    const [v] = await t((q) => q.query<{ broken: string | null }>('SELECT audit_verify($1) AS broken', [P.practiceId]));
    assert.equal(Number(v.broken), 2);
  });

  it('recovery rate carries no money; revenue comes from the practice\'s own fees', async () => {
    const a = await noShow('Isabella Flores'); // crown
    await noShow('Liam O\'Brien');             // srp
    await t((q) => sendOffers(q, ctx, a.openingId!, { limit: 5 }));
    await t((q) => handleReply(q, ctx, P.patients['Priya Shah'], 'YES'));

    const rate = await t((q) => recoveryRate(q, P.practiceId));
    assert.equal(rate.period.openings, 2);
    assert.equal(rate.period.filled, 1);
    assert.equal(rate.period.ratePercent, 50);
    assert.ok(!/revenue|cents|value/i.test(JSON.stringify(rate)), 'front-desk metric has no dollar fields');

    const rev = await t((q) => revenueRecovered(q, P.practiceId));
    assert.equal(rev.period.revenueCents, 115000);
    assert.equal(rev.atStakeCents, 28500, 'the unfilled SRP opening is still at stake');
  });

  it('system actor can be used by scheduled jobs', () => {
    assert.equal(SYSTEM(P.practiceId).role, 'system');
  });
});
