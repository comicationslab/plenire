/** Working-hours helpers shared by the calendar, the booking page and Settings. weekday: 0 = Sunday ... 6 = Saturday. */
export interface HoursWindow { weekday: number; startMin: number; endMin: number }

/** What a provider with no hours set yet works: Monday to Saturday, 9:00 to 17:00 (the server uses the same default). */
export const DEFAULT_HOURS: HoursWindow[] = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMin: 540, endMin: 1020 }));

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Weekday (0-6) of a calendar date written YYYY-MM-DD. Date-only, so no time zone can shift it. */
export const weekdayOfDate = (iso: string): number => new Date(`${iso}T12:00:00Z`).getUTCDay();

export const windowOn = (hours: HoursWindow[] | undefined, weekday: number): HoursWindow | undefined =>
  (hours && hours.length ? hours : DEFAULT_HOURS).find((w) => w.weekday === weekday);

export const fmtMin = (m: number): string => {
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};
export const toHHMM = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * Bookable start times on one date: every `step` minutes where the visit fits inside at least one of the given providers' hours.
 * Returns [] when nobody works that day (the date shows as closed).
 */
export function slotsForDate(dateIso: string, providers: { hours?: HoursWindow[] }[], durationMin: number, step = 30): { time: string; label: string }[] {
  const wd = weekdayOfDate(dateIso);
  const wins = providers.map((p) => windowOn(p.hours, wd)).filter((w): w is HoursWindow => !!w);
  const out: { time: string; label: string }[] = [];
  for (let m = 0; m < 1440; m += step) {
    if (wins.some((w) => m >= w.startMin && m + durationMin <= w.endMin)) out.push({ time: toHHMM(m), label: fmtMin(m) });
  }
  return out;
}
