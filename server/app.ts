import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { secureHeaders } from 'hono/secure-headers';
import { z, ZodError } from 'zod';
import type { Config } from './config';
import { authenticate, practiceUsersOnly, type Env } from './middleware/auth';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { teamRoutes } from './routes/team';
import { consoleEmail, type EmailProvider } from './services/email';
import type { Db } from './db/adapter';
import type { LocalTokens, Role, Verifier } from './auth/tokens';
import { AppError } from './services/errors';
import { audit, type Ctx } from './services/audit';
import { dispatchOutbox, queueMessage, type MessageProvider } from './services/messaging';
import { acceptOffer, handleReply, sendOffers, setAppointmentStatus } from './services/recovery';
import { bookAppointment, createAppointment, createPatient } from './services/scheduling';
import { recoveryRate, revenueRecovered } from './services/metrics';

export type AppConfig = Pick<Config, 'CORS_ORIGINS' | 'ENABLE_SIMULATOR'> &
  Partial<Pick<Config, 'APP_URL' | 'EXPOSE_INVITE_LINKS' | 'TRUST_PROXY' | 'ACCESS_TOKEN_TTL_SECONDS' | 'AUTH_RATE_LIMIT_PER_MINUTE' | 'SESSION_HOURS' | 'SESSION_IDLE_MINUTES' | 'NODE_ENV'>>;

export interface AppDeps {
  db: Db;
  config: AppConfig;
  verifier: Verifier;
  /** Present in local sign-in mode (Plenire issues the tokens). Absent when Amazon Cognito issues them. */
  tokens?: LocalTokens;
  provider: MessageProvider;
  email?: EmailProvider;
}

const uuid = z.string().uuid();
const parse = <T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> => schema.parse(data);

/** Who may do what. Enforced here on the server; hiding buttons in the browser is only decoration. */
const STAFF_WRITE: Role[] = ['owner', 'front_desk'];

/** Browser-reported workstation events that are safe to record (no free text accepted). */
const CLIENT_AUDIT_ACTIONS = ['WORKSTATION_LOCK', 'WORKSTATION_AUTO_LOCK', 'WORKSTATION_UNLOCK', 'UNLOCK_FAILED', 'PRIVACY_SHIELD', 'PIN_SET', 'PIN_CHANGED'] as const;

export function createApp(deps: AppDeps) {
  const { db, verifier, provider } = deps;
  const cfg = {
    APP_URL: 'http://localhost:3000', EXPOSE_INVITE_LINKS: 'true' as const, TRUST_PROXY: 'false' as const,
    ACCESS_TOKEN_TTL_SECONDS: 600, AUTH_RATE_LIMIT_PER_MINUTE: 10, SESSION_HOURS: 12, SESSION_IDLE_MINUTES: 30, NODE_ENV: 'test' as const, ...deps.config,
  };
  const email = deps.email ?? consoleEmail;
  const expose = cfg.EXPOSE_INVITE_LINKS === 'true';
  const app = new Hono<Env>();

  app.use('*', secureHeaders());
  app.use('*', bodyLimit({ maxSize: 100 * 1024, onError: (c) => c.json({ error: { code: 'TOO_LARGE', message: 'Request is too large' } }, 413) }));
  app.use('/api/*', cors({ origin: deps.config.CORS_ORIGINS.split(','), allowHeaders: ['Authorization', 'Content-Type'], maxAge: 600 }));

  app.onError((err, c) => {
    if (err instanceof AppError) return c.json({ error: { code: err.code, message: err.message } }, err.status);
    if (err instanceof ZodError) return c.json({ error: { code: 'INVALID_INPUT', message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') } }, 422);
    // Never log request bodies or stack traces that could contain patient data.
    console.error(`[api] unhandled error: ${(err as Error).name}`);
    return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404));

  app.get('/health', (c) => c.json({ ok: true }));

  // ── public sign-in routes (local mode only; with Cognito, Cognito hosts sign-in) ──
  if (deps.tokens) app.route('/auth', authRoutes({ db, tokens: deps.tokens, email, cfg: { ...cfg, production: cfg.NODE_ENV === 'production' } }));
  app.route('/api/platform', adminRoutes({ db, verifier, email, appUrl: cfg.APP_URL, exposeLinks: expose }));

  const requireRole = (...roles: Role[]) =>
    createMiddleware<Env>(async (c, next) => {
      if (!roles.includes(c.get('role'))) throw new AppError(403, 'FORBIDDEN', 'Your role cannot do this');
      await next();
    });

  const api = new Hono<Env>();
  api.use('*', authenticate(verifier), practiceUsersOnly);
  const run = <T>(c: { get: (k: 'ctx') => Ctx }, fn: (q: Parameters<Parameters<Db['tenant']>[1]>[0], ctx: Ctx) => Promise<T>) =>
    db.tenant(c.get('ctx').practiceId, (q) => fn(q, c.get('ctx')));
  const flush = (c: { get: (k: 'ctx') => Ctx }) => dispatchOutbox(db, c.get('ctx').practiceId, provider).catch(() => {});

  api.get('/me', async (c) =>
    c.json(await run(c, async (q, ctx) => {
      const [practice] = await q.query('SELECT id, name, phone, address, timezone FROM practices WHERE id = $1', [ctx.practiceId]);
      const [staff] = await q.query<{ name: string }>('SELECT name FROM staff WHERE id = $1', [ctx.actorId]);
      return { staffId: ctx.actorId, name: staff?.name ?? 'Staff', role: ctx.role, practice };
    })),
  );

  api.get('/providers', async (c) =>
    c.json(await run(c, (q) => q.query('SELECT id, name, initials, chair, title FROM providers WHERE active ORDER BY chair NULLS LAST, name'))));

  api.get('/appointments', async (c) => {
    const date = c.req.query('date');
    if (date) parse(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), date);
    return c.json(await run(c, (q) => q.query(
      `SELECT a.id, a.starts_at AS "startsAt", a.duration_min AS "durationMin", a.treatment, a.status,
              a.follow_up AS "followUp", a.thanked, a.walk_in AS "walkIn",
              a.patient_id AS "patientId", pt.name AS "patientName", a.provider_id AS "providerId", pr.name AS "providerName", pr.chair
         FROM appointments a
         JOIN practices p ON p.id = a.practice_id
         JOIN patients pt ON pt.practice_id = a.practice_id AND pt.id = a.patient_id
         JOIN providers pr ON pr.practice_id = a.practice_id AND pr.id = a.provider_id
        WHERE (a.starts_at AT TIME ZONE p.timezone)::date = COALESCE($1::date, (now() AT TIME ZONE p.timezone)::date)
        ORDER BY a.starts_at`, [date ?? null])));
  });

  api.patch('/appointments/:id/status', requireRole(...STAFF_WRITE), async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const { status } = parse(z.object({ status: z.enum(['scheduled', 'arrived', 'completed', 'noshow', 'cancelled']) }), await c.req.json());
    return c.json(await run(c, (q, ctx) => setAppointmentStatus(q, ctx, id, status)));
  });

  api.get('/openings', async (c) => {
    const isOwner = c.get('role') === 'owner';
    return c.json(await run(c, async (q) => {
      const openings = await q.query<any>(
        `SELECT o.id, o.kind, o.status, o.treatment, o.starts_at AS "startsAt", o.duration_min AS "durationMin",
                pr.name AS "providerName", pt.name AS "patientName", fb.name AS "filledByName",
                o.value_cents AS "valueCents", estimate_fee_cents(o.practice_id, o.treatment) AS "estValueCents"
           FROM openings o JOIN providers pr ON pr.practice_id = o.practice_id AND pr.id = o.provider_id
           LEFT JOIN patients pt ON pt.practice_id = o.practice_id AND pt.id = o.original_patient_id
           LEFT JOIN patients fb ON fb.practice_id = o.practice_id AND fb.id = o.filled_by_patient_id
          WHERE o.status <> 'closed' AND (o.starts_at AT TIME ZONE (SELECT timezone FROM practices WHERE id = o.practice_id))::date
                = (now() AT TIME ZONE (SELECT timezone FROM practices WHERE id = o.practice_id))::date
          ORDER BY o.starts_at DESC LIMIT 200`);
      const offers = await q.query<any>(
        `SELECT f.id, f.opening_id AS "openingId", f.patient_id AS "patientId", f.status, f.expires_at AS "expiresAt", pt.name AS "patientName"
           FROM offers f JOIN patients pt ON pt.practice_id = f.practice_id AND pt.id = f.patient_id`);
      return openings.map(({ valueCents, estValueCents, ...o }) => ({
        ...o,
        offers: offers.filter((f) => f.openingId === o.id),
        // Dollar figures never leave the server for non-owners.
        ...(isOwner ? { valueCents, estValueCents } : {}),
      }));
    }));
  });

  api.post('/openings', requireRole(...STAFF_WRITE), async (c) => {
    const b = parse(z.object({ providerId: uuid, startsAt: z.string().datetime({ offset: true }), durationMin: z.number().int().min(5).max(480), treatment: z.string().min(1).max(120) }), await c.req.json());
    return c.json(await run(c, async (q, ctx) => {
      const [o] = await q.query<{ id: string }>(
        `INSERT INTO openings (practice_id, provider_id, starts_at, duration_min, kind, treatment) VALUES ($1,$2,$3,$4,'gap',$5) RETURNING id`,
        [ctx.practiceId, b.providerId, b.startsAt, b.durationMin, b.treatment]);
      await audit(q, ctx, 'OPENING_CREATED', { openingId: o.id, kind: 'gap' });
      return { openingId: o.id };
    }), 201);
  });

  api.post('/openings/:id/offers', requireRole(...STAFF_WRITE), async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const body = parse(z.object({ limit: z.number().int().min(1).max(10).optional(), ttlMinutes: z.number().int().min(1).max(240).optional() }), await c.req.json().catch(() => ({})));
    const out = await run(c, (q, ctx) => sendOffers(q, ctx, id, body));
    await flush(c);
    return c.json(out);
  });

  api.post('/offers/:id/accept', requireRole(...STAFF_WRITE), async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const out = await run(c, (q, ctx) => acceptOffer(q, ctx, id));
    await flush(c);
    return c.json(out);
  });

  // Stand-in for the inbound-SMS webhook so the whole loop can be tried without a phone. Off in production.
  api.post('/patients/:id/simulate-reply', requireRole(...STAFF_WRITE), async (c) => {
    if (deps.config.ENABLE_SIMULATOR !== 'true') throw new AppError(404, 'NOT_FOUND');
    const id = parse(uuid, c.req.param('id'));
    const { body } = parse(z.object({ body: z.string().min(1).max(1000) }), await c.req.json());
    const out = await run(c, (q, ctx) => handleReply(q, { ...ctx, actorId: null, role: 'system' }, id, body));
    await flush(c);
    return c.json(out);
  });

  api.get('/patients/summary', async (c) =>
    c.json(await run(c, async (q) => {
      const [r] = await q.query<any>(
        `SELECT count(*)::int AS total, (count(*) FILTER (WHERE sms_consent AND sms_opt_out_at IS NULL))::int AS consented,
                (SELECT count(DISTINCT filled_by_patient_id)::int FROM openings WHERE status = 'filled' AND filled_at > now() - interval '28 days') AS "recovered"
           FROM patients`);
      return r;
    })));

  api.get('/patients', async (c) =>
    c.json(await run(c, (q) => q.query(
      `SELECT pt.id, pt.name, pt.phone, pt.email, pt.sms_consent AS "smsConsent", pt.sms_consent_at AS "smsConsentAt", pt.sms_opt_out_at AS "optedOutAt",
              pt.new_patient AS "newPatient", pt.walk_in AS "walkIn", pt.notes,
              (SELECT max(a.starts_at) FROM appointments a WHERE a.patient_id = pt.id AND a.status IN ('completed','arrived')) AS "lastVisit",
              (SELECT a.treatment FROM appointments a WHERE a.patient_id = pt.id AND a.status NOT IN ('cancelled') ORDER BY a.starts_at DESC LIMIT 1) AS "recentVisit",
              CASE WHEN EXISTS (SELECT 1 FROM waitlist_entries w WHERE w.patient_id = pt.id) THEN 'Waitlist'
                   WHEN EXISTS (SELECT 1 FROM openings o WHERE o.filled_by_patient_id = pt.id AND o.filled_at > now() - interval '28 days') THEN 'Recovered'
                   ELSE 'Active' END AS status
         FROM patients pt ORDER BY pt.name LIMIT 500`))));

  api.post('/patients', requireRole(...STAFF_WRITE), async (c) => {
    const b = parse(z.object({
      name: z.string().trim().min(1).max(120), phone: z.string().max(30).nullish(), email: z.string().email().max(200).nullish(),
      smsConsent: z.boolean().optional(), newPatient: z.boolean().optional(), walkIn: z.boolean().optional(), notes: z.string().max(500).nullish(),
    }), await c.req.json());
    if (b.smsConsent && !b.phone) throw new AppError(422, 'PHONE_REQUIRED', 'A mobile number is needed for texting consent');
    return c.json({ patientId: await run(c, (q, ctx) => createPatient(q, ctx, b)) }, 201);
  });

  api.post('/appointments', requireRole(...STAFF_WRITE), async (c) => {
    const b = parse(z.object({
      patientId: uuid, providerId: uuid, startsAt: z.string().datetime({ offset: true }),
      durationMin: z.number().int().min(5).max(480), treatment: z.string().trim().min(1).max(120), walkIn: z.boolean().optional(),
    }), await c.req.json());
    return c.json({ appointmentId: await run(c, (q, ctx) => createAppointment(q, ctx, b)) }, 201);
  });

  api.patch('/appointments/:id/follow-up', requireRole(...STAFF_WRITE), async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const { followUp } = parse(z.object({ followUp: z.string().trim().max(200).nullable() }), await c.req.json());
    await run(c, async (q, ctx) => {
      const r = await q.query('UPDATE appointments SET follow_up = $2 WHERE id = $1 RETURNING id', [id, followUp || null]);
      if (!r.length) throw new AppError(404, 'APPOINTMENT_NOT_FOUND');
      await audit(q, ctx, 'FOLLOWUP_SET', { appointmentId: id, cleared: !followUp });
    });
    return c.json({ ok: true });
  });

  // Staff-assisted booking (the patient-facing public page comes later; it will need availability + abuse protection).
  api.post('/bookings', requireRole(...STAFF_WRITE), async (c) => {
    const b = parse(z.object({
      firstName: z.string().trim().min(1).max(60), lastName: z.string().trim().min(1).max(60), phone: z.string().trim().min(7).max(30),
      email: z.string().email().max(200).nullish(), newPatient: z.boolean(), smsConsent: z.boolean(), notes: z.string().max(500).nullish(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/),
      durationMin: z.number().int().min(5).max(480), treatment: z.string().trim().min(1).max(120), providerId: uuid.nullable(),
    }), await c.req.json());
    return c.json(await run(c, (q, ctx) => bookAppointment(q, ctx, b)), 201);
  });

  api.get('/waitlist', async (c) =>
    c.json(await run(c, (q) => q.query(
      `SELECT w.id, pt.name AS "patientName", w.treatments, w.urgency, w.created_at AS "addedAt", pt.sms_consent AS "smsConsent", pr.name AS "preferredProvider"
         FROM waitlist_entries w JOIN patients pt ON pt.practice_id = w.practice_id AND pt.id = w.patient_id
         LEFT JOIN providers pr ON pr.practice_id = w.practice_id AND pr.id = w.preferred_provider_id ORDER BY w.created_at`))));

  // ── conversations ──
  api.get('/conversations', async (c) =>
    c.json(await run(c, (q) => q.query(
      `SELECT pt.id AS "patientId", pt.name, pt.phone, (pt.sms_opt_out_at IS NOT NULL) AS "optedOut",
              last.body AS preview, last.direction AS "lastDirection", last.created_at AS "at",
              (SELECT count(*)::int FROM messages m WHERE m.patient_id = pt.id AND m.direction = 'in' AND m.read_at IS NULL) AS unread
         FROM patients pt
         JOIN LATERAL (SELECT body, direction, created_at FROM messages m WHERE m.patient_id = pt.id ORDER BY created_at DESC LIMIT 1) last ON true
        ORDER BY last.created_at DESC LIMIT 100`))));

  api.get('/messages', async (c) => {
    const patientId = parse(uuid, c.req.query('patientId'));
    return c.json(await run(c, (q) => q.query(`SELECT id, direction, body, status, created_at AS "at" FROM messages WHERE patient_id = $1 ORDER BY created_at LIMIT 200`, [patientId])));
  });

  api.post('/patients/:id/messages', requireRole(...STAFF_WRITE), async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const { body } = parse(z.object({ body: z.string().trim().min(1).max(320) }), await c.req.json());
    await run(c, async (q, ctx) => {
      await queueMessage(q, ctx, id, body);     // refuses health wording and patients without consent
      await audit(q, ctx, 'SMS_QUEUED', { patientId: id });
    });
    await flush(c);
    return c.json({ ok: true }, 201);
  });

  api.post('/patients/:id/messages/read', requireRole(...STAFF_WRITE), async (c) => {
    const id = parse(uuid, c.req.param('id'));
    await run(c, (q) => q.query("UPDATE messages SET read_at = now() WHERE patient_id = $1 AND direction = 'in' AND read_at IS NULL", [id]));
    return c.json({ ok: true });
  });

  api.post('/audit/events', async (c) => {
    const { action } = parse(z.object({ action: z.enum(CLIENT_AUDIT_ACTIONS) }), await c.req.json());
    await run(c, (q, ctx) => audit(q, ctx, action, {}));
    return c.json({ ok: true }, 201);
  });

  // ── metrics: the rate is for every role; money is owner-only ──
  api.get('/metrics/recovery', async (c) => c.json(await run(c, (q, ctx) => recoveryRate(q, ctx.practiceId))));
  api.get('/metrics/revenue', requireRole('owner'), async (c) => c.json(await run(c, (q, ctx) => revenueRecovered(q, ctx.practiceId))));

  // ── audit trail: owner-only ──
  api.get('/audit', requireRole('owner'), async (c) =>
    c.json(await run(c, (q) => q.query(`SELECT seq, at, actor_role AS "actorRole", action, details FROM audit_log ORDER BY seq DESC LIMIT 200`))));
  api.get('/audit/verify', requireRole('owner'), async (c) =>
    c.json(await run(c, async (q, ctx) => {
      const [r] = await q.query<{ broken: string | null }>('SELECT audit_verify($1) AS broken', [ctx.practiceId]);
      return { intact: r.broken === null, firstBrokenSeq: r.broken === null ? null : Number(r.broken) };
    })));

  api.route('/', teamRoutes({ db, email, appUrl: cfg.APP_URL, exposeLinks: expose }));

  app.route('/api', api);
  return app;
}
