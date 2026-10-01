import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(8787),
    /** Empty = built-in zero-install database (PGlite) for local development. */
    DATABASE_URL: z.string().optional(),
    AUTH_MODE: z.enum(['dev', 'cognito']).default('dev'),
    DEV_JWT_SECRET: z.string().min(32).optional(),
    COGNITO_REGION: z.string().optional(),
    COGNITO_USER_POOL_ID: z.string().optional(),
    COGNITO_CLIENT_ID: z.string().optional(),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    /** Lets staff type in a patient's reply for demos. Never on in production. */
    ENABLE_SIMULATOR: z.enum(['true', 'false']).default('true'),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === 'production') {
      if (v.AUTH_MODE === 'dev') ctx.addIssue({ code: 'custom', message: 'AUTH_MODE=dev is not allowed in production' });
      if (!v.DATABASE_URL) ctx.addIssue({ code: 'custom', message: 'DATABASE_URL is required in production' });
      if (v.ENABLE_SIMULATOR === 'true') ctx.addIssue({ code: 'custom', message: 'Set ENABLE_SIMULATOR=false in production' });
    }
    if (v.AUTH_MODE === 'cognito' && !(v.COGNITO_REGION && v.COGNITO_USER_POOL_ID && v.COGNITO_CLIENT_ID)) {
      ctx.addIssue({ code: 'custom', message: 'Cognito mode needs COGNITO_REGION, COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID' });
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
