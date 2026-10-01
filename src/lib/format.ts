/** Small, dependency-free helpers shared across the app. */

/** Unguessable ID (crypto-random), e.g. "appt-3f2a…". Replaces Date.now()/Math.random() IDs. */
export function uid(prefix: string): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return `${prefix}-${c.randomUUID()}`;
  const bytes = c.getRandomValues(new Uint8Array(16));
  return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function todayLong(timeZone?: string): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone });
}

export function todayShort(timeZone?: string): string {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone });
}

export function clockNow(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const usd = (n: number): string => '$' + Math.round(n).toLocaleString('en-US');

export const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Cents → "$1,150". */
export const usdCents = (cents: number): string => usd(cents / 100);

/** "2026-09-28" → "Sep 28" (week label for charts; no time-zone shifting). */
export function weekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "(555) 123-4567" → "+15551234567" so carriers accept it. Assumes US numbers when there are 10 digits. */
export function toE164(input: string): string {
  const d = input.replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d.startsWith('1')) return '+' + d;
  return '+' + d;
}
