import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { withTransaction } from '../src/index.ts';
import type { Pooled, Queryable } from '../src/index.ts';

/**
 * A pool that records which connection served each statement.
 *
 * The bug this guards against is invisible to an integration test: issuing
 * BEGIN and COMMIT against a pool works perfectly whenever the pool happens to
 * hand back the same idle connection, which is almost always. Racing it is not
 * reproducible. The property worth asserting is not "it usually works" but
 * "everything ran on one connection", and that is a structural claim a fake
 * can settle exactly.
 */
function fakePool() {
  const log: { connection: number; sql: string }[] = [];
  let connections = 0;
  let open = 0;
  let peakOpen = 0;

  const pool: Pooled = {
    // Anything issued straight at the pool gets a fresh connection each time —
    // the worst case a real pool is allowed to produce.
    async query(sql: string) {
      connections += 1;
      log.push({ connection: connections, sql: String(sql).trim().split(/\s/)[0]!.toLowerCase() });
      return { rows: [] };
    },
    async connect() {
      connections += 1;
      open += 1;
      peakOpen = Math.max(peakOpen, open);
      const id = connections;
      let released = false;

      const client: Queryable & { release(): void } = {
        async query(sql: string) {
          assert.equal(released, false, 'a released connection must not be used again');
          log.push({ connection: id, sql: String(sql).trim().split(/\s/)[0]!.toLowerCase() });
          return { rows: [] };
        },
        release() {
          assert.equal(released, false, 'a connection must not be released twice');
          released = true;
          open -= 1;
        },
      };
      return client;
    },
  };

  return { pool, log, stillOpen: () => open, peakOpen: () => peakOpen };
}

describe('withTransaction', () => {
  test('runs begin, the work and commit on one and the same connection', async () => {
    const { pool, log } = fakePool();

    await withTransaction(pool, async (tx) => {
      await tx.query('update media set name = $1');
      await tx.query('delete from media_files');
    });

    assert.deepEqual(log.map((entry) => entry.sql), ['begin', 'update', 'delete', 'commit']);
    assert.equal(new Set(log.map((entry) => entry.connection)).size, 1);
  });

  test('rolls back on the same connection, not on a fresh one', async () => {
    const { pool, log } = fakePool();

    await assert.rejects(
      () => withTransaction(pool, async (tx) => {
        await tx.query('insert into media values ($1)');
        throw new Error('falla');
      }),
      /falla/,
    );

    assert.deepEqual(log.map((entry) => entry.sql), ['begin', 'insert', 'rollback']);
    assert.equal(new Set(log.map((entry) => entry.connection)).size, 1);
  });

  test('never reaches for the pool directly while a transaction is open', async () => {
    const { pool, log } = fakePool();
    // The fake numbers a pool-level query as its own connection, so a single
    // distinct connection in the log is proof none was issued that way.
    await withTransaction(pool, async (tx) => { await tx.query('select 1'); });
    assert.equal(new Set(log.map((entry) => entry.connection)).size, 1);
  });

  test('returns the connection whether the work succeeds or throws', async () => {
    const { pool, stillOpen } = fakePool();

    await withTransaction(pool, async () => 'listo');
    assert.equal(stillOpen(), 0);

    await assert.rejects(() => withTransaction(pool, async () => { throw new Error('x'); }));
    assert.equal(stillOpen(), 0, 'a leaked connection per failure exhausts the pool');
  });

  test('holds exactly one connection at a time, and hands back the result', async () => {
    const { pool, peakOpen } = fakePool();
    const result = await withTransaction(pool, async () => ({ id: 'm1' }));
    assert.deepEqual(result, { id: 'm1' });
    assert.equal(peakOpen(), 1);
  });
});
