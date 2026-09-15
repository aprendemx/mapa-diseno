import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { generateMapData } from '../src/index.ts';
import type { Medium, Project, State } from '../src/domain/project.ts';
import type { MapContent, MapFileContent } from '../src/domain/map-data.ts';

/**
 * The branches `tests/golden.test.ts` cannot reach.
 *
 * The 29 media of the frozen reference never take any of these paths, so a
 * green golden run proves nothing about them. Expected behaviour here was read
 * off `generar-mapa.ps1` directly — it is the specification, not a guess at
 * what would be reasonable.
 */

const STATES: State[] = [
  { id: 'jal', name: 'Jalisco' },
  { id: 'col', name: 'Colima' },
];

function medium(overrides: Partial<Medium> = {}): Medium {
  return {
    id: 'radio-prueba',
    name: 'Radio Prueba',
    folderSlug: 'radio-prueba',
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
  };
}

/** Narrows a content row to the file variant, failing the test if it is not. */
function asFile(content: MapContent | undefined): MapFileContent {
  assert.ok(content && content.type !== 'social', 'expected a file content row');
  return content;
}

const project = (...media: Medium[]): Project => ({
  version: 4,
  appearance: {} as Project['appearance'],
  states: STATES,
  media,
});

describe('an inactive medium', () => {
  const data = generateMapData(
    project(medium({ active: false, notes: 'Una nota', files: [{ id: 'f1', type: 'video', file: 'contenidos/a.mp4', description: '' }] })),
  );

  test('is emitted with the "0" flag rather than dropped', () => {
    assert.equal(data.media.length, 1);
    assert.equal(data.media[0]?.active, '0');
  });

  test('leaves its origin state inactive', () => {
    assert.equal(data.states.find((s) => s.id === 'jal')?.active, '0');
  });

  test('propagates the flag to every table that references it', () => {
    assert.equal(data.coverage[0]?.active, '0');
    assert.equal(data.campaigns[0]?.active, '0');
    assert.equal(data.contents[0]?.active, '0');
  });
});

describe('a medium with no origin state', () => {
  const data = generateMapData(project(medium({ stateId: '', notes: 'Una nota' })));

  test('produces no coverage row', () => {
    assert.deepEqual(data.coverage, []);
  });

  test('still appears in media, with an empty stateId', () => {
    assert.equal(data.media[0]?.stateId, '');
    assert.equal(data.campaigns[0]?.stateId, '');
  });
});

describe('social themes', () => {
  const themes = [
    { id: 't1', title: 'Con link', links: { instagram: '', facebook: 'https://fb.example/1', x: '', tiktok: '', youtube: '' } },
    { id: 't2', title: 'Sin ningun link', links: { instagram: '', facebook: '', x: '', tiktok: '', youtube: '' } },
    { id: 't3', title: '', links: { instagram: '  https://ig.example/3  ', facebook: '', x: '', tiktok: '', youtube: '' } },
  ];
  const data = generateMapData(project(medium({ socialEnabled: true, socialThemes: themes })));

  test('a theme with all five links empty never ships', () => {
    assert.equal(data.contents.length, 2);
    assert.ok(!data.contents.some((c) => c.id === 't2'));
  });

  test('a theme with no title falls back to its position among ALL themes', () => {
    // t3 is third in the source list even though t2 was dropped.
    const third = data.contents.find((c) => c.id === 't3');
    assert.equal(third?.type === 'social' && third.theme, 'Tema 3');
  });

  test('link values are trimmed', () => {
    const third = data.contents.find((c) => c.id === 't3');
    assert.equal(third?.type === 'social' && third.links.instagram, 'https://ig.example/3');
  });

  test('themes are withheld entirely when social is disabled', () => {
    const off = generateMapData(project(medium({ socialEnabled: false, socialThemes: themes })));
    assert.deepEqual(off.contents, []);
    assert.equal(off.media[0]?.socialEnabled, false);
  });
});

describe('file entries', () => {
  test('type imagen is emitted like video and audio', () => {
    const data = generateMapData(
      project(medium({ files: [{ id: 'f1', type: 'imagen', file: 'contenidos/a.png', description: 'Pie' }] })),
    );
    const content = asFile(data.contents[0]);
    assert.equal(content.type, 'imagen');
    assert.equal(content.file, 'contenidos/a.png');
    assert.equal(content.description, 'Pie');
  });

  test('backslash paths are normalised to forward slashes', () => {
    const data = generateMapData(
      project(medium({ files: [{ id: 'f1', type: 'video', file: 'contenidos\\jal\\a.mp4', description: '' }] })),
    );
    assert.equal(asFile(data.contents[0]).file, 'contenidos/jal/a.mp4');
  });

  test('a blank path is skipped, and does not consume a fallback number', () => {
    const data = generateMapData(
      project(
        medium({
          files: [
            { id: '', type: 'video', file: '   ', description: '' },
            { id: '', type: 'video', file: 'contenidos/b.mp4', description: '' },
          ],
        }),
      ),
    );
    assert.equal(data.contents.length, 1);
    assert.equal(data.contents[0]?.id, 'radio-prueba-archivo-1');
  });
});

describe('a medium with empty notes', () => {
  test('produces no campaigns', () => {
    assert.deepEqual(generateMapData(project(medium({ notes: '' }))).campaigns, []);
    assert.deepEqual(generateMapData(project(medium({ notes: '\n\n   \r\n' }))).campaigns, []);
  });

  test('blank lines do not consume a campaign number', () => {
    const data = generateMapData(project(medium({ notes: 'Primera\n\n  \nSegunda' })));
    assert.deepEqual(
      data.campaigns.map((c) => [c.id, c.name, c.order]),
      [
        ['radio-prueba-nota-1', 'Primera', 1],
        ['radio-prueba-nota-2', 'Segunda', 2],
      ],
    );
  });
});

describe('witnessOrder out of sync with the items it names', () => {
  const files = [
    { id: 'f1', type: 'video' as const, file: 'contenidos/1.mp4', description: '' },
    { id: 'f2', type: 'video' as const, file: 'contenidos/2.mp4', description: '' },
    { id: 'f3', type: 'video' as const, file: 'contenidos/3.mp4', description: '' },
  ];

  test('ids it does not know are ignored, and the rest keep their order', () => {
    const data = generateMapData(
      project(medium({ files, witnessOrder: ['f3', 'borrado-hace-meses', 'f1'] })),
    );
    assert.deepEqual(data.contents.map((c) => c.id), ['f3', 'f1', 'f2']);
  });

  test('items it omits are appended in natural order, never lost', () => {
    const data = generateMapData(project(medium({ files, witnessOrder: [] })));
    assert.deepEqual(data.contents.map((c) => c.id), ['f1', 'f2', 'f3']);
  });

  test('a repeated id is placed once', () => {
    const data = generateMapData(
      project(medium({ files, witnessOrder: ['f2', 'f2', 'f2'] })),
    );
    assert.deepEqual(data.contents.map((c) => c.id), ['f2', 'f1', 'f3']);
  });

  test('order is renumbered from 1 over the final sequence', () => {
    const data = generateMapData(project(medium({ files, witnessOrder: ['f3'] })));
    assert.deepEqual(data.contents.map((c) => c.order), [1, 2, 3]);
  });
});

describe('coverage states', () => {
  test('the origin is removed and duplicates collapse, order preserved', () => {
    const data = generateMapData(
      project(medium({ stateId: 'jal', coverageStates: ['col', 'jal', 'col', '', 'col'] })),
    );
    assert.deepEqual(data.media[0]?.coverageStates, ['col']);
  });
});

describe('appearance fallbacks', () => {
  test('an empty colour keeps the default, but an explicit 0 is honoured', () => {
    const data = generateMapData({
      version: 4,
      appearance: { backgroundColor: '', glowIntensity: 0 } as Project['appearance'],
      states: STATES,
      media: [],
    });
    assert.equal(data.appearance.backgroundColor, '#2f302e');
    assert.equal(data.appearance.glowIntensity, 0);
  });

  test('a missing appearance block yields the full set of defaults', () => {
    const data = generateMapData({ version: 4, states: STATES, media: [] } as unknown as Project);
    assert.equal(Object.keys(data.appearance).length, 15);
    assert.equal(data.appearance.accentColor, '#08783f');
  });
});
