import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateMapData } from '@mapa-mexico/map-generator';
import type { MapData, Project } from '@mapa-mexico/map-generator';

import { toRows, fromRows } from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', 'map-generator', 'tests', 'fixtures', '2026-08');
const read = (name: string): unknown => JSON.parse(readFileSync(join(fixtures, name), 'utf8'));

const project = read('project.json') as Project;
const expected = read('expected-map-data.json') as MapData;

/**
 * The schema is only as good as what survives a trip through it.
 *
 * Splitting one nested document into six tables is where a migration quietly
 * loses an ordering, an empty string or a null. The proof that this one does
 * not is that the map generated from the rebuilt document is still, byte for
 * byte, the map production published.
 */
describe('a full trip through the relational shape', () => {
  const rows = toRows(project);
  const restored = fromRows(rows);

  test('still generates the published map, key order included', () => {
    assert.equal(JSON.stringify(generateMapData(restored)), JSON.stringify(expected));
  });

  test('keeps every medium, in its authored order', () => {
    assert.equal(rows.media.length, 29);
    assert.deepEqual(
      restored.media.map((m) => m.id),
      project.media.map((m) => m.id),
    );
  });

  test('keeps every file and every theme', () => {
    assert.equal(rows.files.length, 158);
    assert.equal(rows.socialThemes.length, 43);
  });

  test('keeps the 32 states and the appearance settings', () => {
    assert.equal(rows.states.length, 32);
    assert.deepEqual(restored.states, project.states);
    assert.deepEqual(restored.appearance, project.appearance);
  });

  test('is idempotent: importing what it exported changes nothing', () => {
    assert.deepEqual(toRows(fromRows(rows)), rows);
  });
});

describe('what the rows refuse to hold', () => {
  const medium = (overrides: Partial<Project['media'][number]>) =>
    ({
      id: 'm1',
      name: 'Medio',
      folderSlug: 'medio',
      active: true,
      stateId: 'jal',
      notes: '',
      coverageText: '',
      coverageStates: [],
      files: [],
      socialEnabled: false,
      socialThemes: [],
      witnessOrder: [],
      ...overrides,
    }) as Project['media'][number];

  const wrap = (m: Project['media'][number]): Project => ({
    version: 4,
    appearance: project.appearance,
    states: [{ id: 'jal', name: 'Jalisco' }],
    media: [m],
  });

  test('a file with a blank path is dropped, not stored empty', () => {
    const rows = toRows(
      wrap(
        medium({
          files: [
            { id: 'f0', type: 'video', file: '   ', description: '' },
            { id: 'f1', type: 'video', file: 'contenidos/a.mp4', description: '' },
          ],
        }),
      ),
    );
    assert.deepEqual(rows.files.map((f) => f.id), ['f1']);
  });

  test('a theme with no links is kept — that is a draft, not corruption', () => {
    const rows = toRows(
      wrap(
        medium({
          socialEnabled: true,
          socialThemes: [
            { id: 't1', title: 'Vacio', links: { instagram: '', facebook: '', x: '', tiktok: '', youtube: '' } },
          ],
        }),
      ),
    );
    assert.equal(rows.socialThemes.length, 1);
    // ...and publish is still where it gets filtered out.
    assert.deepEqual(generateMapData(fromRows(rows)).contents, []);
  });

  test('an unassigned state is null, not the empty string', () => {
    const rows = toRows(wrap(medium({ stateId: '' })));
    assert.equal(rows.media[0]?.state_id, null);
    assert.equal(fromRows(rows).media[0]?.stateId, '');
  });

  test('a duplicated coverage state collapses to one row', () => {
    const rows = toRows(wrap(medium({ coverageStates: ['col', 'col', 'col'] })));
    assert.equal(rows.coverageStates.length, 1);
  });
});

describe('the shared ordering space', () => {
  test('files and themes are numbered against each other, not separately', () => {
    const rows = toRows({
      version: 4,
      appearance: project.appearance,
      states: [{ id: 'jal', name: 'Jalisco' }],
      media: [
        {
          id: 'm1',
          name: 'Medio',
          folderSlug: 'medio',
          active: true,
          stateId: 'jal',
          notes: '',
          coverageText: '',
          coverageStates: [],
          files: [
            { id: 'f1', type: 'video', file: 'contenidos/1.mp4', description: '' },
            { id: 'f2', type: 'video', file: 'contenidos/2.mp4', description: '' },
          ],
          socialEnabled: true,
          socialThemes: [
            { id: 't1', title: 'Tema', links: { instagram: 'https://ig.example/1', facebook: '', x: '', tiktok: '', youtube: '' } },
          ],
          witnessOrder: ['t1', 'f2', 'f1'],
        },
      ],
    });

    assert.deepEqual(
      [...rows.files, ...rows.socialThemes]
        .sort((a, b) => a.witness_position - b.witness_position)
        .map((w) => [w.id, w.witness_position]),
      [['t1', 1], ['f2', 2], ['f1', 3]],
    );
  });
});
