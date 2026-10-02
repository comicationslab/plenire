import { z } from 'zod';
import { apiErrorSchema, sessionSchema, type Session } from './schemas';

const BASE: string = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/*
 * The sign-in token lives ONLY in memory (never localStorage/sessionStorage), so a script injected into the page
 * cannot copy it. A separate HttpOnly cookie, which scripts cannot read, is used to get a fresh token.
 */
let token: string | null = null;
let refreshHandler: (() => Promise<boolean>) | null = null;
let onUnauthorized: () => void = () => {};
export const setToken = (t: string | null) => { token = t; };
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };
export const setRefreshHandler = (fn: (() => Promise<boolean>) | null) => { refreshHandler = fn; };

interface Options { csrf?: boolean }

/** One place that talks to the server: adds the token, checks the response shape, retries once after a silent token refresh. */
export async function api<S extends z.ZodTypeAny>(method: 'GET' | 'POST' | 'PATCH', path: string, schema: S, body?: unknown, opts: Options & { retried?: boolean } = {}): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(opts.csrf ? { 'x-plenire-csrf': '1' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Is it running?');
  }

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith('/auth/')) {
      if (!opts.retried && refreshHandler && (await refreshHandler())) return api(method, path, schema, body, { ...opts, retried: true });
      onUnauthorized();
    }
    const e = apiErrorSchema.safeParse(json);
    throw new ApiError(res.status, e.success ? e.data.error.code : 'ERROR', e.success ? e.data.error.message : 'Something went wrong');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiError(res.status, 'BAD_RESPONSE', 'The server sent something unexpected');
  return parsed.data;
}

/** Asks for a fresh access token using the private cookie. Returns null if there is no valid session. */
export async function refreshSession(): Promise<Session | null> {
  try {
    const s = await api('POST', '/auth/refresh', sessionSchema, undefined, { csrf: true });
    token = s.accessToken;
    return s;
  } catch {
    return null;
  }
}
