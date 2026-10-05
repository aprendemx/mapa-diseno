import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Project } from '@mapa-mexico/map-generator';
import { slug, uniqueSlug } from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const project = JSON.parse(
  readFileSync(join(here, '..', '..', 'map-generator', 'tests', 'fixtures', '2026-08', 'project.json'), 'utf8'),
) as Project;

describe('slug', () => {
  test('strips diacritics rather than transliterating them', () => {
    assert.equal(slug('Radio Educación'), 'radio-educacion');
    assert.equal(slug('Canal 22 de México'), 'canal-22-de-mexico');
    assert.equal(slug('Señal Ñandú'), 'senal-nandu');
  });

  test('collapses every run of punctuation and space into one dash', () => {
    assert.equal(slug('  Radio  ---  Uno!! '), 'radio-uno');
    assert.equal(slug('A, B. C'), 'a-b-c');
  });

  test('keeps the place-name markers out of the id', () => {
    assert.equal(slug('Radio Educación, [[Ciudad de México]]'), 'radio-educacion-ciudad-de-mexico');
  });

  test('never returns an empty id', () => {
    assert.equal(slug(''), 'medio');
    assert.equal(slug('¿?¡!'), 'medio');
    assert.equal(slug('———'), 'medio');
  });

  test('truncates without leaving a trailing dash', () => {
    const long = slug('a'.repeat(68) + ' bcdef');
    assert.ok(long.length <= 70);
    assert.ok(!long.endsWith('-'));
  });

  test('reproduces the ids production actually holds', () => {
    // 28 of 29. The exception is the point: `Radio Educación` was named that
    // when it was created, was renamed later, and kept its id. Ids are frozen
    // on purpose — every published `<mediumId>-nota-N` depends on them.
    const reproduced = project.media.filter((medium) => slug(medium.name) === medium.id);
    assert.equal(reproduced.length, 28);

    const renamed = project.media.find((medium) => medium.id === 'radio-educacion');
    assert.equal(renamed?.name, 'Radio Educación, [[Ciudad de México]]');
    assert.notEqual(slug(renamed!.name), renamed!.id);
  });
});

describe('uniqueSlug', () => {
  test('leaves the first holder with the bare slug', () => {
    assert.equal(uniqueSlug('Radio Uno', new Set()), 'radio-uno');
  });

  test('numbers collisions from 2, matching the legacy convention', () => {
    assert.equal(uniqueSlug('Radio Uno', new Set(['radio-uno'])), 'radio-uno-2');
    assert.equal(uniqueSlug('Radio Uno', new Set(['radio-uno', 'radio-uno-2'])), 'radio-uno-3');
  });

  test('skips over gaps instead of reusing a freed number', () => {
    assert.equal(uniqueSlug('Radio Uno', new Set(['radio-uno', 'radio-uno-3'])), 'radio-uno-2');
  });
});
