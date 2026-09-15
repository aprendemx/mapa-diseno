import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { project, expectedMapData as expected } from './fixtures.ts';

/**
 * Characterisation of the frozen reference.
 *
 * These do not test our code — there is none yet. They pin down the
 * relationships the legacy pipeline held between input and output, so that a
 * corrupted or re-extracted fixture fails here loudly instead of silently
 * redefining what "correct" means for the golden test.
 */
describe('reference fixtures', () => {
  test('input holds the 32 immutable states and the authored media', () => {
    assert.equal(project.states.length, 32);
    assert.equal(project.media.length, 29);
    assert.equal(new Set(project.states.map((s) => s.id)).size, 32);
    assert.equal(new Set(project.media.map((m) => m.id)).size, 29);
  });

  test('every table row points at a medium that exists', () => {
    const ids = new Set(expected.media.map((m) => m.id));
    for (const table of ['coverage', 'campaigns', 'contents'] as const) {
      const orphans = expected[table].filter((row) => !ids.has(row.mediumId));
      assert.deepEqual(orphans, [], `${table} has rows pointing at unknown media`);
    }
  });

  test('campaigns are one per non-blank note line', () => {
    const lines = project.media.reduce(
      (total, m) => total + m.notes.split(/\r?\n/).filter((l) => l.trim()).length,
      0,
    );
    assert.equal(expected.campaigns.length, lines);
    assert.equal(expected.campaigns.length, 144);
  });

  test('contents merge files with the themes of social-enabled media', () => {
    const files = project.media.reduce((n, m) => n + m.files.length, 0);
    const themes = project.media
      .filter((m) => m.socialEnabled)
      .reduce((n, m) => n + m.socialThemes.length, 0);
    assert.equal(expected.contents.length, files + themes);
    assert.equal(expected.contents.length, 201);
  });

  test('coverage carries one row per medium that has an origin state', () => {
    const placed = project.media.filter((m) => m.stateId).length;
    assert.equal(expected.coverage.length, placed);
  });

  test('a state is active only when an active medium originates there', () => {
    const derived = new Set(
      project.media.filter((m) => m.active && m.stateId).map((m) => m.stateId),
    );
    const emitted = new Set(
      expected.states.filter((s) => s.active === '1').map((s) => s.id),
    );
    assert.deepEqual([...emitted].sort(), [...derived].sort());
    assert.equal(emitted.size, 20);
  });

  test('flags are emitted as strings, not booleans', () => {
    for (const row of expected.states) assert.match(row.active, /^[01]$/);
    for (const row of expected.media) assert.match(row.active, /^[01]$/);
  });

  test('place-name markers survive into the published model', () => {
    const marked = expected.media.filter((m) => m.name.includes('[['));
    assert.ok(marked.length > 0, '`[[...]]` markers are part of the data contract');
  });
});

/**
 * Paths the reference data never walks.
 *
 * The golden test can only prove the branches this one dataset happens to
 * exercise. Everything below is a real branch in the legacy generator that
 * zero of the 29 media reach — so a green golden run says nothing about it.
 * Phase 1 owes each of these a hand-written case.
 */
describe('branches the golden reference cannot prove', () => {
  test.todo('a medium with active:false emits active "0" and leaves its state inactive');
  test.todo('a medium with no stateId falls back to the sin-estado folder');
  test.todo('a social theme with all five links empty is dropped from contents');
  test.todo('a file of type imagen is emitted like video and audio');
  test.todo('a medium with empty notes produces no campaigns');
  test.todo('witnessOrder ignores unknown ids and appends the ones it omits');
});
