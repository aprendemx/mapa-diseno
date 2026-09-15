import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  hashSessionToken,
  isExpired,
  issueSession,
  shouldRenew,
  tokenHashesMatch,
  SESSION_LIFETIME_MS,
} from '../src/index.ts';

describe('session tokens', () => {
  test('what the browser gets is never what the database keeps', () => {
    const session = issueSession();
    assert.notEqual(session.token, session.tokenHash);
    assert.equal(session.tokenHash, hashSessionToken(session.token));
    assert.equal(session.tokenHash.length, 64);
  });

  test('carries enough entropy to be unguessable', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => issueSession().token));
    assert.equal(tokens.size, 200);
    // 32 random bytes in base64url.
    assert.ok(Buffer.from(issueSession().token, 'base64url').length === 32);
  });

  test('expires seven days out', () => {
    const now = new Date('2026-09-15T12:00:00Z');
    const session = issueSession(now);
    assert.equal(session.expiresAt.getTime() - now.getTime(), SESSION_LIFETIME_MS);
  });

  test('is expired exactly at its deadline, not a moment after', () => {
    const deadline = new Date('2026-09-15T12:00:00Z');
    assert.equal(isExpired(deadline, new Date('2026-09-15T11:59:59Z')), false);
    assert.equal(isExpired(deadline, deadline), true);
  });

  describe('renewal', () => {
    const now = new Date('2026-09-15T12:00:00Z');
    const at = (fraction: number) => new Date(now.getTime() + SESSION_LIFETIME_MS * fraction);

    test('is not needed while more than half its life remains', () => {
      assert.equal(shouldRenew(at(0.9), now), false);
      assert.equal(shouldRenew(at(0.5), now), false);
    });

    test('kicks in past the halfway mark', () => {
      assert.equal(shouldRenew(at(0.49), now), true);
      assert.equal(shouldRenew(at(0.01), now), true);
    });

    test('never revives one that already expired', () => {
      assert.equal(shouldRenew(at(-0.01), now), false);
    });
  });

  test('comparing hashes tolerates junk without throwing', () => {
    const { tokenHash } = issueSession();
    assert.equal(tokenHashesMatch(tokenHash, tokenHash), true);
    assert.equal(tokenHashesMatch(tokenHash, hashSessionToken('otro')), false);
    assert.equal(tokenHashesMatch(tokenHash, ''), false);
    assert.equal(tokenHashesMatch('', ''), false);
    assert.equal(tokenHashesMatch(tokenHash, 'no-es-hex'), false);
  });
});
