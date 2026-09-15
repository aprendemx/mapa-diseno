import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * OWASP's primary scrypt parameters: N=2^17, r=8, p=1. Roughly 390 ms and
 * 134 MB per hash on the target hardware — a cost worth paying a handful of
 * times a day, and a wall worth putting in front of an offline attacker.
 *
 * Argon2id would be the other defensible choice. It is not used here because
 * it means a native dependency, and this system is maintained by one person
 * who should never have to debug a failed rebuild after a Node upgrade.
 */
const PARAMETERS = { N: 2 ** 17, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

/** Guards against a malicious stored value asking for gigabytes of memory. */
const MAX_N = 2 ** 20;

const memoryFor = (N: number, r: number): number => 256 * N * r;

/**
 * Encodes as `scrypt$N$r$p$salt$hash`, all base64url.
 *
 * Self-describing on purpose: the parameters travel with the hash, so raising
 * them later re-verifies every existing password correctly instead of locking
 * everyone out.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const { N, r, p } = PARAMETERS;
  const derived = await scrypt(password, salt, KEY_LENGTH, { N, r, p, maxmem: memoryFor(N, r) });

  return [
    'scrypt',
    N,
    r,
    p,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

/**
 * Returns false for anything malformed rather than throwing: a corrupted row
 * is a failed login, not a crashed server.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (N < 2 || N > MAX_N || r < 1 || r > 32 || p < 1 || p > 16) return false;

  const salt = Buffer.from(parts[4]!, 'base64url');
  const expected = Buffer.from(parts[5]!, 'base64url');
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = await scrypt(password, salt, expected.length, {
    N, r, p, maxmem: memoryFor(N, r),
  });

  // Constant time: a length check short-circuits, so compare only equal sizes.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/**
 * Burns the same work as a real verification.
 *
 * Call it when the email does not exist. Without it, a failed login returns in
 * a millisecond for unknown users and 390 ms for known ones — which is an API
 * for discovering who has an account.
 */
export async function burnVerificationTime(): Promise<void> {
  const { N, r, p } = PARAMETERS;
  await scrypt('', randomBytes(SALT_LENGTH), KEY_LENGTH, { N, r, p, maxmem: memoryFor(N, r) });
}
