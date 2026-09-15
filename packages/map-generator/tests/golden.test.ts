import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { generateMapData } from '../src/index.ts';
import { project, expectedMapData as expected } from './fixtures.ts';

/**
 * The acceptance criterion for the port.
 *
 * `expected-map-data.json` was lifted out of the map the PowerShell pipeline
 * actually published. Matching it is not evidence that the new generator
 * looks right — it is evidence that it produces what production produced.
 *
 * Tables are asserted one by one so a failure names the table that drifted
 * instead of dumping a 100 KB diff.
 */
describe('generateMapData reproduces the legacy output', () => {
  const actual = () => generateMapData(project);

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
