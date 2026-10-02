import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { createApp } from '../app';
import { cognitoVerifier, localTokens, type LocalTokens } from '../auth/tokens';
import type { Db } from '../db/adapter';
import { DEMO_STAFF, seedPractice, type SeededPractice } from '../db/seed';
import type { MessageProvider } from '../services/messaging';
import { backend, freshDb } from './helpers';

describe(`HTTP API: tokens, roles and the full loop (${backend()})`, () => {
  let db: Db, A: SeededPractice, B: SeededPractice, dev: LocalTokens, app: ReturnType<typeof createApp>;
  const sent: string[] = [];
  const provider: MessageProvider = { send: async (to) => void sent.push(to) };

  const token = (P: SeededPractice, email: string) => dev.issue({ staffId: P.staff[email].id, practiceId: P.practiceId, role: P.staff[email].role });
  const call = async (method: string, path: string, tok?: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  };

  before(async () => {
    db = await freshDb();
    A = await seedPractice(db, { name: 'Lakeside Dental', phone: '(555) 010-0100', staff: DEMO_STAFF });
    B = await seedPractice(db, { name: 'Other Dental', phone: '(555) 020-0200', staff: [{ email: 'b@b.test', name: 'B Owner', role: 'owner' }] });
    dev = localTokens('a-test-secret-that-is-at-least-32-characters-long');
    app = createApp({ db, verifier: dev, tokens: dev, provider, config: { CORS_ORIGINS: 'http://localhost:3000', ENABLE_SIMULATOR: 'true' } });
  });
  after(() => db.close());

  it('rejects missing, malformed, forged, expired and wrongly-claimed tokens', async () => {
    assert.equal((await call('GET', '/api/patients')).status, 401);
    assert.equal((await call('GET', '/api/patients', 'not-a-token')).status, 401);

    const forged = await localTokens('some-other-secret-that-is-also-32-characters!!').issue({ staffId: A.staff['tracy@lakeside.test'].id, practiceId: A.practiceId, role: 'owner' });
    assert.equal((await call('GET', '/api/patients', forged)).status, 401, 'signed with the wrong key');

    const expired = await dev.issue({ staffId: A.staff['tracy@lakeside.test'].id, practiceId: A.practiceId, role: 'front_desk' }, -60);
    assert.equal((await call('GET', '/api/patients', expired)).status, 401, 'expired');

    const key = new TextEncoder().encode('a-test-secret-that-is-at-least-32-characters-long');
    const badRole = await new SignJWT({ practiceId: A.practiceId, role: 'superadmin' }).setProtectedHeader({ alg: 'HS256' }).setSubject(A.staff['tracy@lakeside.test'].id).setIssuer('plenire').setExpirationTime('1h').sign(key);
    assert.equal((await call('GET', '/api/patients', badRole)).status, 401, 'unknown role');

    const noPractice = await new SignJWT({ role: 'owner' }).setProtectedHeader({ alg: 'HS256' }).setSubject(A.staff['tracy@lakeside.test'].id).setIssuer('plenire').setExpirationTime('1h').sign(key);
    assert.equal((await call('GET', '/api/patients', noPractice)).status, 401, 'no practice claim');
  });

  it('staff only ever see their own practice', async () => {
    const mine = await call('GET', '/api/patients', await token(A, 'tracy@lakeside.test'));
    assert.equal(mine.json.length, 6);
    const theirs = await call('GET', '/api/patients', await token(B, 'b@b.test'));
    assert.equal(theirs.json.length, 6);
    const aNames = new Set(mine.json.map((p: any) => p.id));
    assert.ok(theirs.json.every((p: any) => !aNames.has(p.id)));
    // asking for another practice's record by id gives nothing
    const peek = await call('GET', `/api/messages?patientId=${B.patients['Priya Shah']}`, await token(A, 'tracy@lakeside.test'));
    assert.deepEqual(peek.json, []);
    const poke = await call('PATCH', `/api/appointments/${B.appointments['Isabella Flores']}/status`, await token(A, 'tracy@lakeside.test'), { status: 'noshow' });
    assert.equal(poke.status, 404);
  });

  it('front desk sees the recovery rate but is blocked from revenue and the audit log', async () => {
    const fd = await token(A, 'tracy@lakeside.test');
    const rate = await call('GET', '/api/metrics/recovery', fd);
    assert.equal(rate.status, 200);
    assert.ok(!/revenue|cents/i.test(JSON.stringify(rate.json)));
    assert.equal((await call('GET', '/api/metrics/revenue', fd)).status, 403);
    assert.equal((await call('GET', '/api/audit', fd)).status, 403);
    assert.equal((await call('GET', '/api/audit/verify', fd)).status, 403);
  });

  it('the whole loop through the API: no-show → offers → YES → revenue for the owner only', async () => {
    const fd = await token(A, 'tracy@lakeside.test');
    const owner = await token(A, 'mensah@lakeside.test');

    const ns = await call('PATCH', `/api/appointments/${A.appointments['Isabella Flores']}/status`, fd, { status: 'noshow' });
    assert.equal(ns.status, 200);
    const openingId = ns.json.openingId;
    assert.ok(openingId);

    const offers = await call('POST', `/api/openings/${openingId}/offers`, fd, { limit: 3 });
    assert.equal(offers.json.offered, 2, 'Priya and Tyler (Hannah has no consent)');
    assert.ok(sent.length >= 2, 'texts were handed to the provider after commit');

    const yes = await call('POST', `/api/patients/${A.patients['Priya Shah']}/simulate-reply`, fd, { body: 'YES' });
    assert.equal(yes.json.outcome, 'booked');

    const list = await call('GET', '/api/openings', fd);
    const o = list.json.find((x: any) => x.id === openingId);
    assert.equal(o.status, 'filled');

    const rev = await call('GET', '/api/metrics/revenue', owner);
    assert.equal(rev.status, 200);
    assert.equal(rev.json.period.revenueCents, 115000);

    const verify = await call('GET', '/api/audit/verify', owner);
    assert.deepEqual(verify.json, { intact: true, firstBrokenSeq: null });
    const log = await call('GET', '/api/audit', owner);
    assert.ok(log.json.some((e: any) => e.action === 'SLOT_FILLED'));
  });

  it('bad input is rejected cleanly and errors leak nothing', async () => {
    const fd = await token(A, 'tracy@lakeside.test');
    assert.equal((await call('PATCH', `/api/appointments/${A.appointments['Mia Coleman']}/status`, fd, { status: 'exploded' })).status, 422);
    assert.equal((await call('PATCH', '/api/appointments/not-a-uuid/status', fd, { status: 'noshow' })).status, 422);
    const big = await app.request('/api/openings', { method: 'POST', headers: { authorization: `Bearer ${fd}`, 'content-type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(200_000) }) });
    assert.equal(big.status, 413);
    const nf = await call('GET', '/api/nope', fd);
    assert.deepEqual(Object.keys(nf.json.error).sort(), ['code', 'message']);
  });

  it('the reply simulator is off when disabled (production)', async () => {
    const prod = createApp({ db, verifier: dev, tokens: dev, provider, config: { CORS_ORIGINS: '', ENABLE_SIMULATOR: 'false' } });
    const res = await prod.request(`/api/patients/${A.patients['Priya Shah']}/simulate-reply`, {
      method: 'POST', headers: { authorization: `Bearer ${await token(A, 'tracy@lakeside.test')}`, 'content-type': 'application/json' }, body: JSON.stringify({ body: 'YES' }),
    });
    assert.equal(res.status, 404);
  });

  it('sets security headers', async () => {
    const res = await app.request('/health');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(res.headers.get('strict-transport-security'));
  });
});

describe('Amazon Cognito token mapping (tested with a local signing key, no AWS needed)', () => {
  const cfg = { region: 'us-east-1', poolId: 'us-east-1_TEST', clientId: 'client123' };
  const issuer = `https://cognito-idp.${cfg.region}.amazonaws.com/${cfg.poolId}`;
  const sub = '11111111-1111-4111-8111-111111111111';
  const practice = '22222222-2222-4222-8222-222222222222';
  let sign: (claims: Record<string, unknown>, o?: { iss?: string; aud?: string }) => Promise<string>;
  let verifier: ReturnType<typeof cognitoVerifier>;

  before(async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    verifier = cognitoVerifier(cfg, createLocalJWKSet({ keys: [jwk] }));
    sign = (claims, o = {}) => new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setSubject(sub).setIssuer(o.iss ?? issuer).setAudience(o.aud ?? cfg.clientId).setExpirationTime('1h').sign(privateKey);
  });

  it('accepts a Cognito token and reads practice + role from custom attributes', async () => {
    const c = await verifier.verify(await sign({ 'custom:practice_id': practice, 'custom:role': 'owner' }));
    assert.deepEqual(c, { staffId: sub, practiceId: practice, role: 'owner' });
  });
  it('rejects the wrong issuer, wrong app client, or missing attributes', async () => {
    await assert.rejects(verifier.verify(await sign({ 'custom:practice_id': practice, 'custom:role': 'owner' }, { iss: 'https://evil.example' })));
    await assert.rejects(verifier.verify(await sign({ 'custom:practice_id': practice, 'custom:role': 'owner' }, { aud: 'other-client' })));
    await assert.rejects(verifier.verify(await sign({ 'custom:role': 'owner' })));
    await assert.rejects(verifier.verify(await sign({ 'custom:practice_id': practice, 'custom:role': 'root' })));
  });
});
