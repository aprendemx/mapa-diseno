import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { generateMapData } from '../src/index.ts';
import { datasets } from './fixtures.ts';

/**
 * The acceptance criterion for the port, against every delivery we have.
 *
 * Each reference was lifted out of a map the PowerShell pipeline actually
 * published. Matching one is not evidence that the generator looks right — it
 * is evidence that it produces what production produced.
 *
 * `2026-10` matters more than `2026-08` here. The port was written against
 * August, so reproducing it proves the work was done; October was never seen
 * while writing it, so reproducing that proves the work was right.
 *
 * Tables are asserted one by one so a failure names the table that drifted
 * instead of dumping a 100 KB diff.
 */
for (const dataset of datasets) {
  describe(`generateMapData reproduces ${dataset.name}`, () => {
    const actual = () => generateMapData(dataset.project);
    const expected = dataset.expectedMapData;

    test('appearance', () => {
      assert.deepStrictEqual(actual().appearance, expected.appearance);
    });

    test('states', () => {
      assert.deepStrictEqual(actual().states, expected.states);
    });

    test('media', () => {
      assert.deepStrictEqual(actual().media, expected.media);
    });

    test('coverage', () => {
      assert.deepStrictEqual(actual().coverage, expected.coverage);
    });

    test('campaigns', () => {
      assert.deepStrictEqual(actual().campaigns, expected.campaigns);
    });

    test('contents', () => {
      assert.deepStrictEqual(actual().contents, expected.contents);
    });

    test('the whole document, key order included', () => {
      assert.equal(JSON.stringify(actual()), JSON.stringify(expected));
    });
  });
}

/**
 * What the references cover between them.
 *
 * Pinned so that losing a dataset, or adding one that happens to be narrower,
 * shows up as a failing test rather than as quietly weaker evidence.
 */
describe('the references between them exercise', () => {
  const media = datasets.flatMap((dataset) => dataset.project.media);

  test('media that are hidden from the map', () => {
    assert.ok(media.some((medium) => medium.active === false));
  });

  test('media with no notes at all', () => {
    assert.ok(media.some((medium) => medium.notes.trim() === ''));
  });

  test('media with no files at all', () => {
    assert.ok(media.some((medium) => medium.files.length === 0));
  });

  test('media with social themes, and media without', () => {
    assert.ok(media.some((medium) => medium.socialThemes.length > 0));
    assert.ok(media.some((medium) => medium.socialThemes.length === 0));
  });

  test('place-name markers in a title', () => {
    assert.ok(media.some((medium) => medium.name.includes('[[')));
  });
});
