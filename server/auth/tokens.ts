import { createLocalJWKSet, createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from 'jose';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Config } from '../config';

export const ROLES = ['owner', 'front_desk', 'dentist', 'hygienist'] as const;
export type Role = (typeof ROLES)[number];
export const PLATFORM_ADMIN = 'platform_admin' as const;
export type AnyRole = Role | typeof PLATFORM_ADMIN;

export interface Claims {
  /** Staff member id, or platform-admin id */
  staffId: string;
  /** null for platform admins: they belong to no practice */
  practiceId: string | null;
  role: AnyRole;
  /** Sign-in session id, so "sign out my other devices" knows which one to keep */
  sid?: string;
}

const claimsSchema = z
  .object({
    sub: z.string().uuid(),
    practiceId: z.string().uuid().nullish(),
    role: z.enum([...ROLES, PLATFORM_ADMIN]),
    sid: z.string().uuid().optional(),
  })
  .refine((c) => (c.role === PLATFORM_ADMIN ? !c.practiceId : Boolean(c.practiceId)), 'Token needs a practice (or be a platform admin)');

export interface Verifier {
  verify(token: string): Promise<Claims>;
}

interface Options {
  key: Uint8Array | JWTVerifyGetKey;
  algorithms: string[];
  issuer?: string;
  audience?: string;
  /** Maps the token payload to our claim names (Cognito uses custom: attributes). */
  map: (payload: Record<string, unknown>) => unknown;
}

export function makeVerifier(opts: Options): Verifier {
  return {
    async verify(token) {
      const { payload } = await jwtVerify(token, opts.key as any, {
        algorithms: opts.algorithms,
        issuer: opts.issuer,
        audience: opts.audience,
        clockTolerance: 5,
      });
      const parsed = claimsSchema.safeParse(opts.map(payload));
      if (!parsed.success) throw new Error('Token is missing practice or role');
      return { staffId: parsed.data.sub, practiceId: parsed.data.practiceId ?? null, role: parsed.data.role, ...(parsed.data.sid ? { sid: parsed.data.sid } : {}) };
    },
  };
}

/** Amazon Cognito: practice and role arrive as custom attributes set when the staff member is created. */
export const cognitoMap = (p: Record<string, unknown>) => ({
  sub: p.sub,
  practiceId: p['custom:practice_id'],
  role: p['custom:role'],
});

export function cognitoVerifier(cfg: { region: string; poolId: string; clientId: string }, keys?: JWTVerifyGetKey): Verifier {
  const issuer = `https://cognito-idp.${cfg.region}.amazonaws.com/${cfg.poolId}`;
  return makeVerifier({
    key: keys ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)),
    algorithms: ['RS256'],
    issuer,
    audience: cfg.clientId, // ID tokens carry the app client id as "aud"
    map: cognitoMap,
  });
}

/** Plenire's own sign-in: short-lived access tokens signed with a server secret. */
export interface LocalTokens extends Verifier {
  issue(claims: Claims, ttlSeconds?: number): Promise<string>;
}

export function localTokens(secret?: string): LocalTokens {
  const key = new TextEncoder().encode(secret ?? randomBytes(32).toString('hex'));
  const inner = makeVerifier({
    key,
    algorithms: ['HS256'],
    issuer: 'plenire',
    map: (p) => ({ sub: p.sub, practiceId: p.practiceId, role: p.role, sid: p.sid }),
  });
  return {
    verify: inner.verify,
    issue: (c, ttl = 900) =>
      new SignJWT({ practiceId: c.practiceId, role: c.role, ...(c.sid ? { sid: c.sid } : {}) })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(c.staffId)
        .setIssuer('plenire')
        .setIssuedAt()
        .setExpirationTime(`${ttl}s`)
        .sign(key),
  };
}

export function verifierFor(cfg: Config): { verifier: Verifier; tokens?: LocalTokens } {
  if (cfg.AUTH_MODE === 'cognito') {
    return {
      verifier: cognitoVerifier({ region: cfg.COGNITO_REGION!, poolId: cfg.COGNITO_USER_POOL_ID!, clientId: cfg.COGNITO_CLIENT_ID! }),
    };
  }
  const tokens = localTokens(cfg.AUTH_JWT_SECRET);
  return { verifier: tokens, tokens };
}

export { createLocalJWKSet };
