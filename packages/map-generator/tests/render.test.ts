import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MEDIA_STOP_ID,
  MEDIA_STOP_SCRIPT,
  TemplateError,
  generateMapData,
  renderMap,
} from '../src/index.ts';
import type { MapData } from '../src/index.ts';
import { project, expectedMapData } from './fixtures.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');

const template = readFileSync(join(root, 'mapa-base.html'), 'utf8');
const mediaStop = MEDIA_STOP_SCRIPT;
const published = readFileSync(join(root, 'entrega', 'ABRIR MAPA.html'), 'utf8');

const DATA_BLOCK =
  /\/\*__DATOS_GENERADOS_INICIO__\*\/[\s\S]*?\/\*__DATOS_GENERADOS_FIN__\*\//;

const split = (html: string) => {
  const match = html.match(DATA_BLOCK);
  assert.ok(match, 'the rendered page must carry a data block');
  const data = JSON.parse(match[0].match(/const PROJECT_DATA=([\s\S]*);/)![1]!) as MapData;
  return { shell: html.replace(DATA_BLOCK, '<<datos>>'), data };
};

/**
 * The whole pipeline, against the page production is serving.
 *
 * `generate-map-data` proves the catalogue projection. This proves what
 * surrounds it: that the template is filled in the same place, that the media
 * stop script lands where it landed, and that nothing else in 117 KB of SVG
 * and behaviour shifted by a byte.
 */
describe('renderMap reproduces the published page', () => {
  const rendered = renderMap({ template, mediaStop, data: generateMapData(project) });

  test('everything outside the data block is byte-identical', () => {
    assert.equal(split(rendered).shell, split(published).shell);
  });

  test('the data block carries the published catalogue', () => {
    // Byte equality is not available here and should not be: PowerShell wrote
    // accented characters as \uXXXX escapes and JSON.stringify writes UTF-8.
    // Both parse to the same strings, and the map cannot tell them apart.
    assert.deepStrictEqual(split(rendered).data, expectedMapData);
  });

  test('the media stop script is present exactly once', () => {
    const occurrences = rendered.split(`id="${MEDIA_STOP_ID}"`).length - 1;
    assert.equal(occurrences, 1);
    assert.equal(published.split(`id="${MEDIA_STOP_ID}"`).length - 1, 1);
  });
});

describe('injection hazards', () => {
  const minimal = (body = '<body>hola</body>'): string =>
    `<html>/*__DATOS_GENERADOS_INICIO__*/\nconst PROJECT_DATA={};\n/*__DATOS_GENERADOS_FIN__*/${body}</html>`;

  const data = (overrides: Partial<MapData>): MapData => ({
    appearance: expectedMapData.appearance,
    states: [],
    media: [],
    coverage: [],
    campaigns: [],
    contents: [],
    ...overrides,
  });

  test('a $& inside the data does not corrupt the page', () => {
    // String.prototype.replace expands `$&`, `$1` and `$'` in a string
    // replacement. Social links are arbitrary URLs written by editors, so this
    // is a live hazard, not a theoretical one.
    const hostile = data({
      campaigns: [
        { id: 'c1', stateId: 'jal', mediumId: 'm1', name: "Nota $& $1 $' $`", active: '1', order: 1 },
      ],
    });

    const rendered = renderMap({ template: minimal(), mediaStop: '<script id="x"></script>', data: hostile });
    const parsed = JSON.parse(rendered.match(/const PROJECT_DATA=([\s\S]*?);\r\n/)![1]!) as MapData;
    assert.equal(parsed.campaigns[0]?.name, "Nota $& $1 $' $`");
  });

  test('a </body> inside the data does not close the document early', () => {
    const hostile = data({
      campaigns: [
        { id: 'c1', stateId: 'jal', mediumId: 'm1', name: '</body>', active: '1', order: 1 },
      ],
    });
    const rendered = renderMap({ template: minimal(), mediaStop: '<script id="stop"></script>', data: hostile });
    // The script goes before the real closing tag, not before the one in the data.
    assert.ok(rendered.indexOf('<script id="stop">') > rendered.indexOf('const PROJECT_DATA'));
    assert.equal(rendered.split('<script id="stop">').length - 1, 1);
  });

  test('rendering twice does not stack two media stop scripts', () => {
    const once = renderMap({ template: minimal(), mediaStop, data: data({}) });
    const twice = renderMap({ template: once, mediaStop, data: data({}) });
    assert.equal(twice.split(`id="${MEDIA_STOP_ID}"`).length - 1, 1);
  });

  test('a template without the markers is refused, not silently published', () => {
    assert.throws(
      () => renderMap({ template: '<html><body></body></html>', mediaStop, data: data({}) }),
      TemplateError,
    );
  });

  test('a template with no closing body still gets the script', () => {
    const rendered = renderMap({
      template: minimal(''),
      mediaStop: '<script id="stop"></script>',
      data: data({}),
    });
    assert.ok(rendered.includes('<script id="stop">'));
  });
});
