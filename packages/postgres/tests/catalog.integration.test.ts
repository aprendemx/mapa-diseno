import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { generateMapData } from '@mapa-mexico/map-generator';
import type { MapData, Project } from '@mapa-mexico/map-generator';
import { toRows, fromRows } from '@mapa-mexico/project-store';
import type { CatalogRows } from '@mapa-mexico/project-store';

import { readCatalog, replaceCatalog } from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const read = (...path: string[]): unknown =>
  JSON.parse(readFileSync(join(root, ...path), 'utf8'));

const project = read('packages', 'map-generator', 'tests', 'fixtures', 'project.json') as Project;
const expected = read('packages', 'map-generator', 'tests', 'fixtures', 'expected-map-data.json') as MapData;
const schema = readFileSync(join(root, 'packages', 'project-store', 'src', 'schema.sql'), 'utf8');

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgres://mapa:mapa_dev@127.0.0.1:5432/mapa';

/**
 * This suite drops and recreates the public schema, so it refuses to run
 * against anything but a loopback address. A test that can reach production is
 * a test that will eventually reach production.
 */
const isLocal = /@(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(DATABASE_URL);

let pool: pg.Pool | undefined;
let reachable = false;

before(async () => {
  if (!isLocal) return;
  pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  try {
    await pool.query('select 1');
    reachable = true;
  } catch {
    await pool.end();
    pool = undefined;
  }
});

after(async () => {
  await pool?.end();
});

describe('the catalogue, through real SQL', () => {
  let stored: CatalogRows | undefined;
  const imported = toRows(project);

  test('imports and reads back the whole catalogue', async (t) => {
    if (!reachable || !pool) return t.skip('no local Postgres on DATABASE_URL');

    await pool.query('drop schema public cascade; create schema public;');
    await pool.query(schema);

    await replaceCatalog(pool, imported);
    stored = await readCatalog(pool);

    assert.equal(stored.media.length, 29);
    assert.equal(stored.files.length, 158);
    assert.equal(stored.socialThemes.length, 43);
    assert.equal(stored.states.length, 32);
  });

  test('returns rows identical to the ones it was given', async (t) => {
    if (!stored) return t.skip('no local Postgres on DATABASE_URL');
    // Catches exactly what a stubbed driver would not: numeric coming back as
    // a string, a boolean as 't', an integer widened to something else.
    assert.deepStrictEqual(stored, imported);
  });

  test('still generates the published map after the round trip', async (t) => {
    if (!stored) return t.skip('no local Postgres on DATABASE_URL');
    assert.equal(
      JSON.stringify(generateMapData(fromRows(stored))),
      JSON.stringify(expected),
    );
  });

  test('a failed import leaves the catalogue untouched', async (t) => {
    if (!reachable || !pool) return t.skip('no local Postgres on DATABASE_URL');

    const broken: CatalogRows = {
      ...imported,
      // A file pointing at a medium that was never inserted: the foreign key
      // rejects it halfway through, after media and coverage already went in.
      files: [...imported.files, { ...imported.files[0]!, id: 'huerfano', medium_id: 'no-existe' }],
    };

    await assert.rejects(() => replaceCatalog(pool!, broken));

    const after = await readCatalog(pool);
    assert.deepStrictEqual(after, imported, 'the rollback must restore every table');
  });
});
