import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { hashPassword, verifyPassword } from '../src/index.ts';

describe('password hashing', () => {
  test('accepts the right password and rejects the wrong one', async () => {
    const stored = await hashPassword('correcta-y-larga');
    assert.equal(await verifyPassword('correcta-y-larga', stored), true);
    assert.equal(await verifyPassword('correcta-y-larg', stored), false);
    assert.equal(await verifyPassword('', stored), false);
  });

  test('hashes the same password to different values', async () => {
    const [a, b] = await Promise.all([hashPassword('misma'), hashPassword('misma')]);
    assert.notEqual(a, b, 'a shared salt would let one rainbow table cover every user');
  });

  test('records the parameters it used, so they can be raised later', async () => {
    const stored = await hashPassword('x');
    const [algorithm, N, r, p] = stored.split('$');
    assert.equal(algorithm, 'scrypt');
    assert.equal(Number(N), 2 ** 17);
    assert.equal(Number(r), 8);
    assert.equal(Number(p), 1);
  });

  test('still verifies a hash written with weaker parameters', async () => {
    // What an upgrade looks like: old rows must keep working, or raising the
    // cost locks every existing user out.
    const legacy = 'scrypt$1024$8$1$c2FsdHNhbHQ$' +
      (await import('node:crypto')).scryptSync('vieja', Buffer.from('saltsalt'), 32, {
        N: 1024, r: 8, p: 1, maxmem: 256 * 1024 * 8,
      }).toString('base64url');
    assert.equal(await verifyPassword('vieja', legacy), true);
    assert.equal(await verifyPassword('otra', legacy), false);
  });

  describe('a malformed stored value fails the login instead of the server', () => {
    for (const [label, stored] of [
      ['empty', ''],
      ['not our format', 'argon2$v=19$m=65536'],
      ['too few fields', 'scrypt$131072$8$1$c2FsdA'],
      ['non-numeric cost', 'scrypt$abc$8$1$c2FsdA$aGFzaA'],
      ['empty salt', 'scrypt$131072$8$1$$aGFzaA'],
      ['absurd N, a memory bomb', `scrypt$${2 ** 30}$8$1$c2FsdA$aGFzaA`],
    ] as const) {
      test(label, async () => {
        assert.equal(await verifyPassword('cualquiera', stored), false);
      });
    }
  });
});
