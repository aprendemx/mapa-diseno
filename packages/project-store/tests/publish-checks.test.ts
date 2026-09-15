import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Project } from '@mapa-mexico/map-generator';
import { checkPublishable } from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const real = JSON.parse(
  readFileSync(join(here, '..', '..', 'map-generator', 'tests', 'fixtures', 'project.json'), 'utf8'),
) as Project;

const allPresent = () => true;
const nonePresent = () => false;

const clone = (): Project => structuredClone(real);

describe('checkPublishable', () => {
  test('passes the real catalogue when every file is on disk', async () => {
    assert.deepEqual(await checkPublishable(real, allPresent), []);
  });

  test('reports every missing file, not just the first', async () => {
    const problems = await checkPublishable(real, nonePresent);
    assert.equal(problems.length, 158);
    assert.ok(problems.every((problem) => problem.field === 'files'));
    assert.match(problems[0]!.message, /^No se encontró: contenidos\//);
  });

  test('accepts an async existence check', async () => {
    const problems = await checkPublishable(real, async (path) => !path.endsWith('.mp3'));
    assert.equal(problems.length, 17);
  });

  test('demands exactly 32 states', async () => {
    const short = clone();
    short.states.pop();
    const problems = await checkPublishable(short, allPresent);
    assert.ok(problems.some((p) => p.field === 'states' && /exactamente los 32/.test(p.message)));
  });

  test('catches a duplicated state id', async () => {
    const duplicated = clone();
    duplicated.states[1] = { ...duplicated.states[0]! };
    const problems = await checkPublishable(duplicated, allPresent);
    assert.ok(problems.some((p) => /Estado repetido/.test(p.message)));
  });

  test('catches a medium with no name and one with a repeated id', async () => {
    const broken = clone();
    broken.media[0]!.name = '   ';
    broken.media[2]!.id = broken.media[1]!.id;

    const problems = await checkPublishable(broken, allPresent);
    assert.ok(problems.some((p) => p.message === 'Hay un medio sin nombre.'));
    assert.ok(problems.some((p) => /Identificador repetido/.test(p.message)));
  });

  test('catches a state that is not in the catalogue', async () => {
    const broken = clone();
    broken.media[0]!.stateId = 'zzz';
    broken.media[1]!.coverageStates = ['yyy'];

    const problems = await checkPublishable(broken, allPresent);
    assert.ok(problems.some((p) => p.field === 'media' && /Estado inválido/.test(p.message)));
    assert.ok(problems.some((p) => p.field === 'coverage' && /cobertura inválido/.test(p.message)));
  });

  test('a medium with no state at all is fine — that is not an invalid state', async () => {
    const unassigned = clone();
    unassigned.media[0]!.stateId = '';
    assert.deepEqual(await checkPublishable(unassigned, allPresent), []);
  });

  test('a file entry with a blank path is skipped, not reported missing', async () => {
    const blank = clone();
    blank.media[0]!.files[0]!.file = '   ';
    const problems = await checkPublishable(blank, allPresent);
    assert.deepEqual(problems, []);
  });
});
