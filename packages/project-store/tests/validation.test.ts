import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type { Appearance } from '@mapa-mexico/map-generator';
import { validateAppearance, validateMedium } from '../src/index.ts';
import type { MediumInput } from '../src/index.ts';

const STATES = new Set(['jal', 'col', 'cmx']);

const medium = (overrides: Partial<MediumInput> = {}): MediumInput => ({
  name: 'Radio Prueba',
  stateId: 'jal',
  active: true,
  notes: '',
  coverageText: '',
  coverageStates: [],
  socialEnabled: false,
  socialThemes: [],
  ...overrides,
});

const fields = (input: MediumInput) => validateMedium(input, STATES).map((p) => p.field);

describe('validateMedium', () => {
  test('accepts a well-formed medium', () => {
    assert.deepEqual(validateMedium(medium(), STATES), []);
  });

  test('reports every problem at once, not one per round trip', () => {
    const problems = validateMedium(
      medium({ name: '   ', stateId: 'zzz', coverageStates: ['nope'] }),
      STATES,
    );
    assert.equal(problems.length, 3);
    assert.deepEqual(problems.map((p) => p.field).sort(), ['coverageStates', 'name', 'stateId']);
  });

  test('a blank name is rejected, whitespace and all', () => {
    assert.ok(fields(medium({ name: '' })).includes('name'));
    assert.ok(fields(medium({ name: '   \n ' })).includes('name'));
  });

  test('no state at all is fine — that is what null means', () => {
    assert.deepEqual(validateMedium(medium({ stateId: null }), STATES), []);
  });

  test('coverage cannot repeat a state or restate the origin', () => {
    assert.ok(fields(medium({ coverageStates: ['col', 'col'] })).includes('coverageStates'));
    assert.ok(fields(medium({ stateId: 'jal', coverageStates: ['jal'] })).includes('coverageStates'));
  });

  describe('social links', () => {
    const withLink = (link: string) =>
      medium({
        socialEnabled: true,
        socialThemes: [
          { title: 'Tema', links: { instagram: link, facebook: '', x: '', tiktok: '', youtube: '' } },
        ],
      });

    test('http and https are allowed, and empty means unset', () => {
      assert.deepEqual(validateMedium(withLink('https://fb.example/1'), STATES), []);
      assert.deepEqual(validateMedium(withLink(''), STATES), []);
      assert.deepEqual(validateMedium(withLink('   '), STATES), []);
    });

    test('a javascript: link is refused — it would run for every visitor', () => {
      // eslint-disable-next-line no-script-url
      const problems = validateMedium(withLink('javascript:alert(1)'), STATES);
      assert.equal(problems.length, 1);
      assert.match(problems[0]!.field, /links\.instagram$/);
    });

    test('other schemes are refused too', () => {
      for (const link of ['data:text/html,<script>', 'file:///etc/passwd', 'no-es-una-url']) {
        assert.equal(validateMedium(withLink(link), STATES).length, 1, link);
      }
    });
  });
});

const appearance = (overrides: Partial<Appearance> = {}): Appearance => ({
  backgroundColor: '#2f302e',
  titleColor: '#e9e9dc',
  stateWithMediaColor: '#e9e9dc',
  stateDisabledColor: '#e9e9dc',
  stateHoverColor: '#43a56f',
  stateSelectedColor: '#08783f',
  coverageOriginColor: '#08783f',
  coverageAreaColor: '#43a56f',
  glowColor: '#f4cf45',
  glowIntensity: 18,
  glowOpacity: 85,
  glowCoreSize: 2,
  glowSpread: 10,
  glowOutline: 1.6,
  accentColor: '#08783f',
  ...overrides,
});

describe('validateAppearance', () => {
  test('accepts the defaults', () => {
    assert.deepEqual(validateAppearance(appearance()), []);
  });

  test('demands six-digit hex, not names or shorthands', () => {
    for (const colour of ['red', '#fff', '08783f', '#08783', '']) {
      const problems = validateAppearance(appearance({ backgroundColor: colour }));
      assert.equal(problems.length, 1, colour);
      assert.equal(problems[0]?.field, 'backgroundColor');
    }
  });

  test('keeps numbers inside the ranges the sliders offer', () => {
    assert.equal(validateAppearance(appearance({ glowOpacity: 101 })).length, 1);
    assert.equal(validateAppearance(appearance({ glowIntensity: -1 })).length, 1);
    assert.equal(validateAppearance(appearance({ glowOutline: 5.1 })).length, 1);
    assert.deepEqual(validateAppearance(appearance({ glowOpacity: 0 })), []);
    assert.deepEqual(validateAppearance(appearance({ glowOutline: 5 })), []);
  });

  test('rejects a fractional value where the slider steps by one', () => {
    assert.equal(validateAppearance(appearance({ glowIntensity: 18.5 })).length, 1);
    assert.deepEqual(validateAppearance(appearance({ glowCoreSize: 2.5 })), []);
  });

  test('rejects values that are not numbers at all', () => {
    assert.equal(validateAppearance(appearance({ glowSpread: NaN })).length, 1);
    assert.equal(
      validateAppearance(appearance({ glowSpread: '10' as unknown as number })).length,
      1,
    );
  });
});
