/** Small, dependency-free helpers shared across the app. */

/** Unguessable ID (crypto-random), e.g. "appt-3f2a…". Replaces Date.now()/Math.random() IDs. */
export function uid(prefix: string): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return `${prefix}-${c.randomUUID()}`;
  const bytes = c.getRandomValues(new Uint8Array(16));
  return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

// 32 unambiguous characters (no I, O, 0, 1) -> 256 % 32 === 0, so no modulo bias.
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Patient-facing booking reference, e.g. "PL-7KQ2M9XA" (~40 bits of entropy). */
export function bookingRef(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
  return 'PL-' + Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
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
