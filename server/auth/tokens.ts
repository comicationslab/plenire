import { createLocalJWKSet, createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from 'jose';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Config } from '../config';

export const ROLES = ['owner', 'front_desk', 'dentist', 'hygienist'] as const;
export type Role = (typeof ROLES)[number];

export interface Claims {
  staffId: string;
  practiceId: string;
  role: Role;
}

const claimsSchema = z.object({
  sub: z.string().uuid(),
  practiceId: z.string().uuid(),
  role: z.enum(ROLES),
});

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
      return { staffId: parsed.data.sub, practiceId: parsed.data.practiceId, role: parsed.data.role };
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

/** Local development only: tokens signed with a shared secret by our own /auth/dev-login. */
export interface DevAuth extends Verifier {
  issue(claims: Claims, ttlSeconds?: number): Promise<string>;
}

export function devAuth(secret?: string): DevAuth {
  const key = new TextEncoder().encode(secret ?? randomBytes(32).toString('hex'));
  const inner = makeVerifier({
    key,
    algorithms: ['HS256'],
    issuer: 'plenire-dev',
    map: (p) => ({ sub: p.sub, practiceId: p.practiceId, role: p.role }),
  });
  return {
    verify: inner.verify,
    issue: (c, ttl = 8 * 3600) =>
      new SignJWT({ practiceId: c.practiceId, role: c.role })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(c.staffId)
        .setIssuer('plenire-dev')
        .setIssuedAt()
        .setExpirationTime(`${ttl}s`)
        .sign(key),
  };
}

export function verifierFor(cfg: Config): { verifier: Verifier; dev?: DevAuth } {
  if (cfg.AUTH_MODE === 'cognito') {
    return {
      verifier: cognitoVerifier({ region: cfg.COGNITO_REGION!, poolId: cfg.COGNITO_USER_POOL_ID!, clientId: cfg.COGNITO_CLIENT_ID! }),
    };
  }
  const dev = devAuth(cfg.DEV_JWT_SECRET);
  return { verifier: dev, dev };
}

export { createLocalJWKSet };
