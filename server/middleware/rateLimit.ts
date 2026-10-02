import { createMiddleware } from 'hono/factory';
import { AppError } from '../services/errors';

/**
 * Simple per-client request limiter for the public sign-in endpoints (slows password guessing and email spam).
 * Memory-based, so it is per server instance. At scale the same rule is enforced by AWS WAF / API Gateway.
 * Account lockout (in the database) is the guard that holds no matter how many servers there are.
 */
export function rateLimit(opts: { max: number; windowMs: number; trustProxy: boolean }) {
  const hits = new Map<string, number[]>();
  return createMiddleware(async (c, next) => {
    const ip = opts.trustProxy ? (c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown') : 'direct';
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < opts.windowMs);
    if (recent.length >= opts.max) throw new AppError(429, 'RATE_LIMITED', 'Too many requests. Please wait a minute and try again.');
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < opts.windowMs)) hits.delete(k);
    await next();
  });
}
