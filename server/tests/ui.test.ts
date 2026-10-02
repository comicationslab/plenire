/**
 * End-to-end check of the browser screens against the REAL backend (no mocks):
 * real database → real API → Zod-checked responses → the actual React screens, rendered for each role.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';
import { createApp } from '../app';
import { localTokens, type LocalTokens } from '../auth/tokens';
import type { Db } from '../db/adapter';
import { seedDemo, seedPlatformAdmin, type SeededPractice } from '../db/seed';
import { backend, freshDb } from './helpers';

describe(`screens against the real backend (${backend()})`, () => {
  let adminId = '';
  let db: Db, A: SeededPractice, vite: ViteDevServer, dev: LocalTokens, app: ReturnType<typeof createApp>;
  let M: Record<string, any>; // loaded browser modules
  const realFetch = globalThis.fetch;

  const act = async (token: string, method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

  /** Signs in as a role, preloads exactly the data the screens ask for, and renders one screen to HTML. */
  async function render(who: 'tracy@lakeside.test' | 'mensah@lakeside.test', route: string, view: string, name: string) {
    const token = await dev.issue({ staffId: A.staff[who].id, practiceId: A.practiceId, role: A.staff[who].role });
    M.client.setToken(token);
    const qc = new M.rq.QueryClient({ defaultOptions: { queries: { retry: false } } });
    const q = M.hooks;
    const isOwner = A.staff[who].role === 'owner';
    const convs = await qc.fetchQuery(q.conversationsQuery);
    await Promise.all([
      q.meQuery, q.providersQuery, q.appointmentsQuery, q.openingsQuery, q.patientsQuery, q.patientSummaryQuery,
      q.waitlistQuery, q.conversationsQuery, q.recoveryRateQuery, ...(isOwner ? [q.revenueQuery, q.auditQuery, q.auditVerifyQuery] : []),
      ...(convs[0] ? [q.messagesQuery(convs[0].patientId)] : []),
    ].map((o) => qc.fetchQuery(o))); // any response that breaks the Zod contract throws here
    const Screen = M[view][name];
    const tree: ReactElement = h(M.rq.QueryClientProvider, { client: qc },
      h(M.auth.AuthProvider, null,
        h(M.router.MemoryRouter, { initialEntries: [route] },
          h(M.practice.PracticeProvider, null,
            h(M.hipaa.HIPAAProvider, null, h(Screen))))));
    return renderToString(tree);
  }

  /** Renders any screen for any signed-in user, with exactly the data it asks for already loaded. */
  async function renderAs(token: string, route: string, Screen: unknown, queries: unknown[], withPractice = true) {
    M.client.setToken(token);
    const qc = new M.rq.QueryClient({ defaultOptions: { queries: { retry: false } } });
    await Promise.all(queries.map((o) => qc.fetchQuery(o as never)));
    const inner = h(Screen as never);
    const body = withPractice ? h(M.practice.PracticeProvider, null, h(M.hipaa.HIPAAProvider, null, inner)) : inner;
    return renderToString(h(M.rq.QueryClientProvider, { client: qc }, h(M.auth.AuthProvider, null, h(M.router.MemoryRouter, { initialEntries: [route] }, body))));
  }
  const tokenFor = (email: string) => dev.issue({ staffId: A.staff[email].id, practiceId: A.practiceId, role: A.staff[email].role }, 3600);

  before(async () => {
    db = await freshDb();
    A = await seedDemo(db);
    adminId = await seedPlatformAdmin(db, 'admin@plenire.test', 'Platform Admin', 'Maple-Harbor-Cedar-92');
    dev = localTokens('a-test-secret-that-is-at-least-32-characters-long');
    app = createApp({ db, verifier: dev, tokens: dev, provider: { send: async () => {} }, config: { CORS_ORIGINS: '', ENABLE_SIMULATOR: 'true' } });
    // the browser client calls fetch('/api/...'): point it straight at the in-process server
    globalThis.fetch = ((url: string, init?: RequestInit) => app.request(url, init)) as typeof fetch;

    vite = await createServer({ root: process.cwd(), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
    const L = (p: string) => vite.ssrLoadModule(p);
    M = {
      client: await L('/src/api/client.ts'), hooks: await L('/src/api/hooks.ts'), format: await L('/src/api/format.ts'),
      rq: await import('@tanstack/react-query'), router: await import('react-router'),
      auth: await L('/src/auth/AuthContext.tsx'), practice: await L('/src/context/PracticeContext.tsx'), hipaa: await L('/src/context/HIPAAContext.tsx'),
      ff: await L('/src/components/views/DashboardFrontDesk.tsx'), ow: await L('/src/components/views/DashboardOwner.tsx'),
      today: await L('/src/components/views/CleanToday.tsx'), rec: await L('/src/components/views/CleanRecovery.tsx'),
      msg: await L('/src/components/views/CleanMessages.tsx'), pat: await L('/src/components/views/CleanPatients.tsx'),
      wl: await L('/src/components/views/CleanWaitlist.tsx'), set: await L('/src/components/views/CleanSettings.tsx'),
      login: await L('/src/pages/Login.tsx'), team: await L('/src/pages/Team.tsx'), admin: await L('/src/pages/Admin.tsx'), invite: await L('/src/pages/AcceptInvite.tsx'),
    };

    // A realistic morning: Liam no-shows, offers go out, Priya says YES.
    const tracy = await dev.issue({ staffId: A.staff['tracy@lakeside.test'].id, practiceId: A.practiceId, role: 'front_desk' });
    const ns = await (await act(tracy, 'PATCH', `/api/appointments/${A.appointments["Liam O'Brien"]}/status`, { status: 'noshow' })).json() as any;
    await act(tracy, 'POST', `/api/openings/${ns.openingId}/offers`, { limit: 3 });
    await act(tracy, 'POST', `/api/patients/${A.patients['Priya Shah']}/simulate-reply`, { body: 'YES' });
    await act(tracy, 'POST', `/api/patients/${A.patients['Tyler Green']}/simulate-reply`, { body: 'Can I come at 4 instead?' });
  });
  after(async () => { globalThis.fetch = realFetch; await vite?.close(); await db?.close(); });

  const FD = 'tracy@lakeside.test' as const, OWNER = 'mensah@lakeside.test' as const;

  it('front desk dashboard shows the recovery rate and no dollar amounts', async () => {
    const html = await render(FD, '/dashboard', 'ff', 'DashboardFrontDesk');
    assert.match(html, /Recovery rate/);
    assert.match(html, /\d+%/);
    assert.ok(!html.includes('$'), 'no money on the front desk dashboard');
  });

  it('owner dashboard shows estimated revenue recovered with real dollar figures', async () => {
    const html = await render(OWNER, '/dashboard', 'ow', 'DashboardOwner');
    assert.match(html, /Est\. revenue recovered/);
    assert.match(html, /\$[\d,]+/);
    assert.match(html, /Still at stake today/);
  });

  it('every front-desk screen is free of dollar amounts', async () => {
    for (const [route, view, name] of [['/today', 'today', 'CleanToday'], ['/recovery', 'rec', 'CleanRecovery'], ['/messages', 'msg', 'CleanMessages'], ['/patients', 'pat', 'CleanPatients'], ['/waitlist', 'wl', 'CleanWaitlist'], ['/settings', 'set', 'CleanSettings']] as const) {
      const html = await render(FD, route, view, name);
      assert.ok(html.length > 500, `${name} rendered`);
      assert.ok(!html.includes('$'), `${name} has no money for the front desk`);
    }
  });

  it('Recovery: front desk sees rate; owner sees revenue; both see the filled slot', async () => {
    const fd = await render(FD, '/recovery', 'rec', 'CleanRecovery');
    assert.match(fd, /Recovery rate · 28 days/);
    assert.match(fd, /booked this slot/);
    const ow = await render(OWNER, '/recovery', 'rec', 'CleanRecovery');
    assert.match(ow, /Est\. revenue recovered · 28 days/);
    assert.match(ow, /est\. recovered/);
    assert.ok(ow.includes('$285'), 'the SRP fee from this practice\'s own schedule');
  });

  it('Today lists the day\'s appointments from the database', async () => {
    const html = await render(FD, '/today', 'today', 'CleanToday');
    for (const n of ['Isabella Flores', 'Mia Coleman']) assert.ok(html.includes(n), n);
  });

  it('Messages shows the real conversations and the unread reply', async () => {
    const html = await render(FD, '/messages', 'msg', 'CleanMessages');
    assert.ok(html.includes('Tyler Green') || html.includes('Priya Shah'));
    assert.match(html, /unread/);
  });

  it('Patients and Waitlist show real counts and consent state', async () => {
    const pat = await render(FD, '/patients', 'pat', 'CleanPatients');
    assert.ok(pat.includes('Hannah Cho'));
    const wl = await render(FD, '/waitlist', 'wl', 'CleanWaitlist');
    assert.ok(wl.includes('No texting consent'), 'Hannah never agreed to texts');
  });

  it('time-zone helper handles daylight saving correctly', () => {
    const { zonedToIso } = M.format;
    assert.equal(zonedToIso('2026-10-02', '13:30', 'America/Chicago'), '2026-10-02T18:30:00.000Z'); // CDT
    assert.equal(zonedToIso('2026-12-01', '13:30', 'America/Chicago'), '2026-12-01T19:30:00.000Z'); // CST
    assert.equal(zonedToIso('2026-03-09', '09:00', 'America/Chicago'), '2026-03-09T14:00:00.000Z'); // day after spring-forward
  });

  it('a response that breaks the contract is rejected instead of crashing a screen', async () => {
    const { api, setToken } = M.client;
    const { z } = await import('zod');
    setToken(await dev.issue({ staffId: A.staff[FD].id, practiceId: A.practiceId, role: 'front_desk' }));
    await assert.rejects(api('GET', '/api/patients', z.array(z.object({ id: z.number() }))), /unexpected/);
  });

  it('a 401 signs the browser out', async () => {
    const { api, setToken, setUnauthorizedHandler } = M.client;
    const { z } = await import('zod');
    let signedOut = false;
    setUnauthorizedHandler(() => { signedOut = true; });
    setToken('not-a-real-token');
    await assert.rejects(api('GET', '/api/me', z.object({})));
    assert.ok(signedOut);
  });

  it('the sign-in page asks for a password and has no click-to-login shortcuts', async () => {
    const html = await renderAs('', '/login', M.login.Login, [], false);
    assert.match(html, /type="password"/);
    assert.match(html, /Forgot password\?/);
    assert.ok(!/Front desk|Owner<|Local demo accounts/.test(html), 'no demo account buttons');
  });

  it('Team page (owner): lists the team with invite form and controls', async () => {
    const html = await renderAs(await tokenFor('mensah@lakeside.test'), '/team', M.team.Team, [M.hooks.meQuery, M.hooks.providersQuery, M.hooks.staffQuery]);
    assert.match(html, /Invite a team member/);
    assert.ok(html.includes('Tracy R.') && html.includes('Dr. Kwame Mensah'));
    assert.match(html, /Turn off/);
    assert.match(html, /\(you\)/);
  });

  it('Settings: owners can manage providers; front desk cannot', async () => {
    const q = [M.hooks.meQuery, M.hooks.providersQuery];
    const owner = await renderAs(await tokenFor('mensah@lakeside.test'), '/settings', M.set.CleanSettings, q);
    const desk = await renderAs(await tokenFor('tracy@lakeside.test'), '/settings', M.set.CleanSettings, q);
    assert.match(owner, /Providers &amp; chairs/);
    assert.ok(!/Providers &amp; chairs/.test(desk));
    assert.match(owner, /Change password/);
    assert.match(desk, /Change password/);
  });

  it('platform console lists clinics and offers to add one, with no patient data anywhere', async () => {
    const platform = await dev.issue({ staffId: adminId, practiceId: null, role: 'platform_admin' }, 3600);
    const html = await renderAs(platform, '/admin', M.admin.AdminConsole, [M.hooks.adminPracticesQuery, M.hooks.adminAdminsQuery], false);
    assert.match(html, /Plenire Platform/);
    assert.match(html, /Add a clinic/);
    assert.ok(html.includes('Lakeside Dental'));
    for (const secret of ['Isabella', 'Priya', 'Tyler', 'Crown']) assert.ok(!html.includes(secret), `console must not show ${secret}`);
    // and the API agrees: the same token is refused on patient routes
    assert.equal((await act(platform, 'GET', '/api/patients')).status, 403);
  });

  it('invitation page explains an unusable link instead of crashing', async () => {
    const html = await renderAs('', '/accept-invite', M.invite.AcceptInvite, [], false);
    assert.match(html, /isn&#x27;t working|isn't working/);
  });

  it('the browser quietly refreshes an expired token once, then retries the request', async () => {
    const { api, setToken, setRefreshHandler } = M.client;
    const { z } = await import('zod');
    const good = await tokenFor('tracy@lakeside.test');
    let refreshes = 0;
    setToken('expired-token');
    setRefreshHandler(async () => { refreshes++; setToken(good); return true; });
    const me = await api('GET', '/api/me', z.object({ name: z.string() }));
    assert.equal(me.name, 'Tracy R.');
    assert.equal(refreshes, 1);
    setRefreshHandler(null);
  });

  it('when refreshing fails the browser signs the person out; a wrong password is NOT treated as an expired session', async () => {
    const { api, setToken, setRefreshHandler, setUnauthorizedHandler } = M.client;
    const { z } = await import('zod');
    let out = 0, refreshes = 0;
    setUnauthorizedHandler(() => { out++; });
    setRefreshHandler(async () => { refreshes++; return false; });
    setToken('expired-token');
    await assert.rejects(api('GET', '/api/me', z.object({})));
    assert.deepEqual([out, refreshes], [1, 1]);
    await assert.rejects(api('POST', '/auth/login', z.object({}), { email: 'tracy@lakeside.test', password: 'wrong-password-123' }), /Incorrect email or password/);
    assert.deepEqual([out, refreshes], [1, 1], 'a failed login does not trigger refresh or sign-out');
    setRefreshHandler(null);
  });
});
