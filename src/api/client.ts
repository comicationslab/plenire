import { z } from 'zod';
import { apiErrorSchema } from './schemas';

const BASE: string = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

let token: string | null = null;
let onUnauthorized: () => void = () => {};
export const setToken = (t: string | null) => { token = t; };
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

/** One place that talks to the server: adds the sign-in token, checks the response shape, turns failures into ApiError. */
export async function api<S extends z.ZodTypeAny>(method: 'GET' | 'POST' | 'PATCH', path: string, schema: S, body?: unknown): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Is it running?');
  }

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    const e = apiErrorSchema.safeParse(json);
    throw new ApiError(res.status, e.success ? e.data.error.code : 'ERROR', e.success ? e.data.error.message : 'Something went wrong');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiError(res.status, 'BAD_RESPONSE', 'The server sent something unexpected');
  return parsed.data;
}
