import { z } from 'zod';

const bool = z.enum(['true', 'false']);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(8787),
    /** Empty = built-in zero-install database (PGlite) for local development. */
    DATABASE_URL: z.string().optional(),
    /** local = Plenire's own email + password sign-in. cognito = Amazon Cognito issues the tokens. */
    AUTH_MODE: z.enum(['local', 'cognito']).default('local'),
    AUTH_JWT_SECRET: z.string().min(32).optional(),
    COGNITO_REGION: z.string().optional(),
    COGNITO_USER_POOL_ID: z.string().optional(),
    COGNITO_CLIENT_ID: z.string().optional(),
    /** Where the web app lives; invitation and reset links point here. */
    APP_URL: z.string().url().default('http://localhost:3000'),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    EMAIL_PROVIDER: z.enum(['console', 'ses']).default('console'),
    /** Shows invitation links in API responses so you can copy them in development. Never in production. */
    EXPOSE_INVITE_LINKS: bool.default('true'),
    /** Lets staff type in a patient's reply for demos. Never on in production. */
    ENABLE_SIMULATOR: bool.default('true'),
    /** Only turn on when running behind a load balancer you trust (so the real client address is used for rate limits). */
    TRUST_PROXY: bool.default('false'),
    AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(10),
    SCRYPT_LOG_N: z.coerce.number().int().min(10).max(20).default(15),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
    SESSION_HOURS: z.coerce.number().int().min(1).max(72).default(12),
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(480).default(30),
  })
  .superRefine((v, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (v.NODE_ENV === 'production') {
      if (!v.DATABASE_URL) bad('DATABASE_URL is required in production');
      if (v.ENABLE_SIMULATOR === 'true') bad('Set ENABLE_SIMULATOR=false in production');
      if (v.EXPOSE_INVITE_LINKS === 'true') bad('Set EXPOSE_INVITE_LINKS=false in production (links must be emailed, not shown)');
      if (v.AUTH_MODE === 'local') {
        if (!v.AUTH_JWT_SECRET) bad('AUTH_JWT_SECRET (32+ characters) is required in production');
        if (v.EMAIL_PROVIDER === 'console') bad('EMAIL_PROVIDER=console is not allowed in production (invitations must be emailed)');
        if (!v.APP_URL.startsWith('https://')) bad('APP_URL must be https in production');
        if (v.SCRYPT_LOG_N < 15) bad('SCRYPT_LOG_N must be at least 15 in production');
      }
    }
    if (v.AUTH_MODE === 'cognito' && !(v.COGNITO_REGION && v.COGNITO_USER_POOL_ID && v.COGNITO_CLIENT_ID)) {
      bad('Cognito mode needs COGNITO_REGION, COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID');
    }
  });

export type Config = z.infer<typeof schema>;

/** Throws with a readable list of problems if the environment is unsafe or incomplete. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error('Invalid configuration:\n' + parsed.error.issues.map((i) => ` - ${i.message}`).join('\n'));
  }
  return parsed.data;
}
