import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { hashPassword, issueSession, verifyPassword } from '@mapa-mexico/auth';
import {
  createSession,
  createUser,
  deleteExpiredSessions,
  deleteSession,
  findSessionUser,
  findUserByEmail,
  renewSession,
} from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(
  join(here, '..', '..', 'project-store', 'src', 'schema.sql'),
  'utf8',
);

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgres://mapa:mapa_dev@127.0.0.1:5432/mapa';
const isLocal = /@(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(DATABASE_URL);

let pool: pg.Pool | undefined;
/** Why the suite could not run. Empty means it did. */
let unavailable = 'DATABASE_URL is not a loopback address';

before(async () => {
  if (!isLocal) return;
  const candidate = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  try {
    await candidate.query('select 1');
    await candidate.query('drop schema public cascade; create schema public;');
    await candidate.query(schema);
    pool = candidate;
  } catch (error) {
    unavailable = error instanceof Error ? error.message : String(error);
    await candidate.end();
  }
});

after(async () => {
  await pool?.end();
});

const skip = (t: { skip: (reason: string) => void }): boolean => {
  if (pool) return false;
  t.skip(`database unavailable: ${unavailable}`);
  return true;
};

describe('users and sessions, through real SQL', () => {
  test('a stored password verifies, and the plaintext is nowhere', async (t) => {
    if (skip(t)) return;

    const passwordHash = await hashPassword('la-contrasena-real');
    await createUser(pool!, { email: 'Editor@Aprende.gob.mx', name: 'Editora', passwordHash });

    const found = await findUserByEmail(pool!, 'editor@aprende.gob.mx');
    assert.ok(found, 'email lookup must ignore case');
    assert.equal(found.name, 'Editora');
    assert.ok(!found.password_hash.includes('la-contrasena-real'));
    assert.equal(await verifyPassword('la-contrasena-real', found.password_hash), true);
  });

  test('an unknown email resolves to nothing', async (t) => {
    if (skip(t)) return;
    assert.equal(await findUserByEmail(pool!, 'nadie@aprende.gob.mx'), undefined);
  });

  test('a live session resolves to its user', async (t) => {
    if (skip(t)) return;

    const user = await findUserByEmail(pool!, 'editor@aprende.gob.mx');
    const session = issueSession();
    await createSession(pool!, {
      tokenHash: session.tokenHash,
      userId: user!.id,
      expiresAt: session.expiresAt,
    });

    const resolved = await findSessionUser(pool!, session.tokenHash);
    assert.equal(resolved?.user.email, 'Editor@Aprende.gob.mx');
    assert.ok(!('password_hash' in (resolved?.user ?? {})), 'never hand back password material');
  });

  test('the raw token is not a key into the table', async (t) => {
    if (skip(t)) return;
    const session = issueSession();
    const user = await findUserByEmail(pool!, 'editor@aprende.gob.mx');
    await createSession(pool!, {
      tokenHash: session.tokenHash,
      userId: user!.id,
      expiresAt: session.expiresAt,
    });
    // What the browser holds must be useless to anyone reading the database.
    assert.equal(await findSessionUser(pool!, session.token), undefined);
  });

  test('an expired session authenticates nobody', async (t) => {
    if (skip(t)) return;

    const user = await findUserByEmail(pool!, 'editor@aprende.gob.mx');
    const session = issueSession();
    await createSession(pool!, {
      tokenHash: session.tokenHash,
      userId: user!.id,
      expiresAt: new Date(Date.now() - 1000),
    });

    assert.equal(await findSessionUser(pool!, session.tokenHash), undefined);
  });

  test('renewing brings an almost-dead session back into range', async (t) => {
    if (skip(t)) return;

    const user = await findUserByEmail(pool!, 'editor@aprende.gob.mx');
    const session = issueSession();
    await createSession(pool!, {
      tokenHash: session.tokenHash,
      userId: user!.id,
      expiresAt: new Date(Date.now() + 2000),
    });

    const extended = new Date(Date.now() + 60_000);
    await renewSession(pool!, session.tokenHash, extended);
    const resolved = await findSessionUser(pool!, session.tokenHash);
    assert.ok(resolved && resolved.expiresAt.getTime() > Date.now() + 30_000);
  });

  test('signing out removes the session for good', async (t) => {
    if (skip(t)) return;

    const user = await findUserByEmail(pool!, 'editor@aprende.gob.mx');
    const session = issueSession();
    await createSession(pool!, {
      tokenHash: session.tokenHash,
      userId: user!.id,
      expiresAt: session.expiresAt,
    });

    await deleteSession(pool!, session.tokenHash);
    assert.equal(await findSessionUser(pool!, session.tokenHash), undefined);
  });

  test('housekeeping clears expired rows and spares the live ones', async (t) => {
    if (skip(t)) return;

    const removed = await deleteExpiredSessions(pool!);
    assert.ok(removed >= 1, 'the expired session from earlier should have been swept');

    const survivors = await pool!.query('select count(*)::int as n from sessions');
    assert.ok((survivors.rows[0] as { n: number }).n >= 1);
  });
});
