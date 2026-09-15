import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { withTransaction } from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(
  join(here, '..', '..', 'project-store', 'src', 'schema.sql'),
  'utf8',
);

const DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgres://mapa:mapa_dev@127.0.0.1:5432/mapa_test';
const isLocal = /@(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(DATABASE_URL);
const isTestDatabase = /_test(\?|$)/.test(DATABASE_URL);

let pool: pg.Pool | undefined;
let unavailable = 'TEST_DATABASE_URL must be a loopback database whose name ends in _test';

before(async () => {
  if (!isLocal || !isTestDatabase) return;
  const candidate = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
  try {
    await candidate.query('drop schema public cascade; create schema public;');
    await candidate.query(schema);
    await candidate.query(
      "insert into states (id, name, position) values ('jal', 'Jalisco', 1)",
    );
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

const insert = (db: { query: pg.Pool['query'] }, id: string) =>
  db.query(
    `insert into media (id, name, active, state_id, notes, coverage_text, social_enabled, position)
     values ($1, $1, true, 'jal', '', '', false, 1)`,
    [id],
  );

/**
 * Why this suite exists.
 *
 * Transaction control used to be issued straight at the pool — `db.query
 * ('begin')`, then the work, then `db.query('commit')`. Each of those is an
 * independent checkout. With one caller and an idle pool they all land on the
 * same connection and everything looks correct, which is exactly how the bug
 * survived: the sequential tests could not see it.
 *
 * Under concurrency they land on different connections, and one caller's BEGIN
 * starts pairing with another's COMMIT. That is the only condition this system
 * is actually built for — two people editing at once.
 */
describe('transactions hold one connection', () => {
  test('a rollback undoes its own work and nothing else', async (t) => {
    if (skip(t)) return;

    const failing = withTransaction(pool!, async (tx) => {
      await insert(tx as never, 'dentro-de-la-transaccion');
      // Long enough that the concurrent write below is genuinely in flight.
      await tx.query('select pg_sleep(0.3)');
      throw new Error('falla deliberada');
    });

    const concurrent = (async () => {
      await new Promise((done) => setTimeout(done, 100));
      await insert(pool!, 'fuera-de-la-transaccion');
    })();

    await assert.rejects(() => failing, /falla deliberada/);
    await concurrent;

    const rows = await pool!.query('select id from media order by id');
    assert.deepEqual(
      (rows.rows as { id: string }[]).map((row) => row.id),
      ['fuera-de-la-transaccion'],
      'the rollback must not take the concurrent write with it',
    );
  });

  test('two transactions at once each commit their own work', async (t) => {
    if (skip(t)) return;
    await pool!.query('delete from media');

    await Promise.all([
      withTransaction(pool!, async (tx) => {
        await insert(tx as never, 'primera');
        await tx.query('select pg_sleep(0.2)');
      }),
      withTransaction(pool!, async (tx) => {
        await insert(tx as never, 'segunda');
        await tx.query('select pg_sleep(0.2)');
      }),
    ]);

    const rows = await pool!.query('select id from media order by id');
    assert.deepEqual((rows.rows as { id: string }[]).map((r) => r.id), ['primera', 'segunda']);
  });

  test('the connection goes back to the pool even when the work throws', async (t) => {
    if (skip(t)) return;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      await assert.rejects(
        () => withTransaction(pool!, async () => { throw new Error('siempre falla'); }),
      );
    }
    // A leaked connection per failure would exhaust a pool of four long before
    // here, and this query would hang rather than fail.
    assert.equal((await pool!.query('select 1 as ok')).rows.length, 1);
  });
});
