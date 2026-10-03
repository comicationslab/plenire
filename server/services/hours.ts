import type { Queryable } from '../db/adapter';
import { audit, type Ctx } from './audit';
import { AppError } from './errors';

/** One working window on one weekday. weekday: 0 = Sunday ... 6 = Saturday. Minutes from midnight, practice time zone. */
export interface Window { weekday: number; startMin: number; endMin: number }

/** A provider nobody has set hours for works Monday-Saturday, 9:00-17:00 (Sunday closed, as the booking page always behaved). */
export const DEFAULT_WINDOWS: Window[] = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMin: 540, endMin: 1020 }));

/** Hours for the given providers (or all active ones), keyed by provider id. Falls back to the default when none were ever set. */
export async function hoursByProvider(q: Queryable, providerIds?: string[]): Promise<Map<string, Window[]>> {
  const rows = await q.query<{ provider_id: string; weekday: number; start_min: number; end_min: number }>(
    'SELECT provider_id, weekday, start_min, end_min FROM provider_hours ORDER BY weekday');
  const set = new Map<string, Window[]>();
  for (const r of rows) set.set(r.provider_id, [...(set.get(r.provider_id) ?? []), { weekday: r.weekday, startMin: r.start_min, endMin: r.end_min }]);
  const ids = providerIds ?? (await q.query<{ id: string }>('SELECT id FROM providers WHERE active')).map((p) => p.id);
  return new Map(ids.map((id) => [id, set.get(id) ?? DEFAULT_WINDOWS]));
}

/** Replaces a provider's weekly hours. An empty list = no working days (the provider cannot be booked). */
export async function setProviderHours(q: Queryable, ctx: Ctx, providerId: string, windows: Window[]) {
  const [p] = await q.query('SELECT 1 FROM providers WHERE id = $1', [providerId]);
  if (!p) throw new AppError(404, 'PROVIDER_NOT_FOUND');
  const days = new Set(windows.map((w) => w.weekday));
  if (days.size !== windows.length) throw new AppError(422, 'BAD_HOURS', 'Each weekday can have only one set of hours');
  for (const w of windows) {
    if (w.startMin % 15 || w.endMin % 15) throw new AppError(422, 'BAD_HOURS', 'Times must be on 15-minute steps');
    if (w.endMin <= w.startMin) throw new AppError(422, 'BAD_HOURS', 'Closing time must be after opening time');
  }
  // No rows means "use the default", so an empty list cannot mean "never works". To stop booking someone, remove them under Providers.
  if (!windows.length) throw new AppError(422, 'BAD_HOURS', 'Choose at least one working day. To stop booking this provider, remove them from Providers.');
  await q.query('DELETE FROM provider_hours WHERE provider_id = $1', [providerId]);
  for (const w of windows) {
    await q.query('INSERT INTO provider_hours (practice_id, provider_id, weekday, start_min, end_min) VALUES ($1,$2,$3,$4,$5)', [ctx.practiceId, providerId, w.weekday, w.startMin, w.endMin]);
  }
  await audit(q, ctx, 'PROVIDER_HOURS_SET', { providerId, days: windows.length });
}

/**
 * Throws OUTSIDE_HOURS unless the whole visit fits inside the provider's hours on that weekday (practice time zone).
 * Used for bookings and scheduled visits. Walk-ins skip it: someone is already in the chair.
 */
export async function assertWithinHours(q: Queryable, ctx: Ctx, providerId: string, startsAt: string, durationMin: number) {
  const [t] = await q.query<{ dow: number; m: number }>(
    `SELECT extract(dow FROM ($1::timestamptz AT TIME ZONE p.timezone))::int AS dow,
            (extract(hour FROM ($1::timestamptz AT TIME ZONE p.timezone)) * 60 + extract(minute FROM ($1::timestamptz AT TIME ZONE p.timezone)))::int AS m
       FROM practices p WHERE p.id = $2`, [startsAt, ctx.practiceId]);
  const windows = (await hoursByProvider(q, [providerId])).get(providerId) ?? [];
  const w = windows.find((x) => x.weekday === t.dow);
  if (!w || t.m < w.startMin || t.m + durationMin > w.endMin) {
    throw new AppError(409, 'OUTSIDE_HOURS', 'That provider is not working at that time');
  }
}
