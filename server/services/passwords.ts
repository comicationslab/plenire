import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password storage. scrypt (memory-hard) with a random salt per password, as recommended by OWASP.
 * Stored as  scrypt$N$r$p$salt$hash  so the cost can be raised later and old hashes still verify.
 */
const scrypt = (pw: string, salt: Buffer, len: number, o: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(pw, salt, len, o, (e, k) => (e ? reject(e) : resolve(k))));

let logN = 15;
/** Called once at startup from configuration (tests use a low cost so they run fast). */
export const setScryptCost = (n: number) => { logN = n; };

const R = 8, P = 3;
const opts = (N: number, r: number): ScryptOptions => ({ N, r, p: P, maxmem: 256 * N * r });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const N = 2 ** logN;
  const key = await scrypt(password, salt, 32, opts(N, R));
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 256 * Number(n) * Number(r) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

let dummy: Promise<string> | undefined;
/** Burns the same time as a real check, so response time doesn't reveal whether an email exists. */
export async function dummyVerify(password: string): Promise<void> {
  dummy ??= hashPassword('not-a-real-password');
  await verifyPassword(password, await dummy);
}

const COMMON = new Set(['password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd1234', 'qwertyuiop12', 'qwerty123456', '123456789012', '111111111111', 'letmein12345', 'welcome12345', 'iloveyou1234', 'administrator', 'changeme1234', 'plenire12345', 'dentaloffice1']);

/** Returns a human-readable problem, or null when the password is acceptable. */
export function passwordProblem(password: string, who: { email?: string; name?: string } = {}): string | null {
  if (password.length < 12) return 'Use at least 12 characters. A few random words works well.';
  if (password.length > 128) return 'Use 128 characters or fewer.';
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return 'That password is too common. Pick something harder to guess.';
  if (/(password|qwerty|plenire|123456)/.test(lower)) return 'Avoid obvious words like "password" or "123456".';
  const local = who.email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return 'Do not include your email name in your password.';
  for (const part of (who.name ?? '').toLowerCase().split(/\s+/)) if (part.length >= 4 && lower.includes(part)) return 'Do not include your name in your password.';
  if (new Set(password).size < 5) return 'Use a wider mix of characters.';
  return null;
}
