import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Seven days. Short enough to matter, long enough not to annoy three people. */
export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** Past this much of its life, using a session extends it. */
const RENEW_AFTER = 0.5;

export interface IssuedSession {
  /** Goes to the browser. Never stored. */
  token: string;
  /** Goes to the database. Never leaves the server. */
  tokenHash: string;
  expiresAt: Date;
}

/**
 * The database stores only the hash.
 *
 * Someone who reads the sessions table therefore gets nothing they can present
 * as a cookie — the same reason passwords are not stored either. The token is
 * 256 bits of randomness, so a plain SHA-256 is the right tool: there is no
 * low-entropy secret here for an attacker to guess at.
 */
export const hashSessionToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export function issueSession(now: Date = new Date()): IssuedSession {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
  };
}

export const isExpired = (expiresAt: Date, now: Date = new Date()): boolean =>
  expiresAt.getTime() <= now.getTime();

/** True once the session is past half its life, so it can be extended in place. */
export function shouldRenew(expiresAt: Date, now: Date = new Date()): boolean {
  const remaining = expiresAt.getTime() - now.getTime();
  return remaining > 0 && remaining < SESSION_LIFETIME_MS * RENEW_AFTER;
}

/** Constant-time comparison of two hex digests of equal length. */
export function tokenHashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}
