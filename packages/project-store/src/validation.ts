import type { Appearance } from '@mapa-mexico/map-generator';

/**
 * Input rules for everything the editor can change.
 *
 * Every function returns the list of problems rather than throwing on the
 * first one: someone filling a form deserves to see all of it at once, not to
 * fix one field per round trip.
 */

export interface Problem {
  field: string;
  message: string;
}

const MAX_NAME = 200;
const MAX_TEXT = 4000;
const MAX_NOTES = 20_000;
const MAX_URL = 2000;

const SOCIAL_NETWORKS = ['instagram', 'facebook', 'x', 'tiktok', 'youtube'] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

export interface MediumInput {
  name: string;
  stateId: string | null;
  active: boolean;
  notes: string;
  coverageText: string;
  coverageStates: string[];
  socialEnabled: boolean;
  socialThemes: {
    id?: string;
    title: string;
    links: Record<SocialNetwork, string>;
  }[];
}

/** Only http(s). A `javascript:` link in the map would execute for a visitor. */
function urlProblem(value: string): string | undefined {
  if (value.trim() === '') return undefined;
  if (value.length > MAX_URL) return 'La dirección es demasiado larga.';

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return 'No es una dirección válida.';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Solo se permiten direcciones http y https.';
  }
  return undefined;
}

export function validateMedium(
  input: MediumInput,
  knownStateIds: ReadonlySet<string>,
): Problem[] {
  const problems: Problem[] = [];

  const name = input.name?.trim() ?? '';
  if (!name) problems.push({ field: 'name', message: 'El nombre no puede quedar vacío.' });
  else if (name.length > MAX_NAME) {
    problems.push({ field: 'name', message: `El nombre no puede pasar de ${MAX_NAME} caracteres.` });
  }

  if (input.stateId !== null && !knownStateIds.has(input.stateId)) {
    problems.push({ field: 'stateId', message: 'Ese estado no existe en el catálogo.' });
  }

  if ((input.notes?.length ?? 0) > MAX_NOTES) {
    problems.push({ field: 'notes', message: 'Las notas son demasiado largas.' });
  }
  if ((input.coverageText?.length ?? 0) > MAX_TEXT) {
    problems.push({ field: 'coverageText', message: 'El texto de cobertura es demasiado largo.' });
  }

  const seenCoverage = new Set<string>();
  for (const stateId of input.coverageStates ?? []) {
    if (!knownStateIds.has(stateId)) {
      problems.push({
        field: 'coverageStates',
        message: `Estado de cobertura desconocido: ${stateId}.`,
      });
    }
    if (seenCoverage.has(stateId)) {
      problems.push({ field: 'coverageStates', message: `Estado repetido: ${stateId}.` });
    }
    seenCoverage.add(stateId);
  }
  if (input.stateId && seenCoverage.has(input.stateId)) {
    problems.push({
      field: 'coverageStates',
      message: 'El estado de origen ya está cubierto; no hace falta agregarlo.',
    });
  }

  (input.socialThemes ?? []).forEach((theme, index) => {
    if ((theme.title?.length ?? 0) > MAX_NAME) {
      problems.push({
        field: `socialThemes.${index}.title`,
        message: 'El nombre del tema es demasiado largo.',
      });
    }
    for (const network of SOCIAL_NETWORKS) {
      const problem = urlProblem(theme.links?.[network] ?? '');
      if (problem) {
        problems.push({ field: `socialThemes.${index}.links.${network}`, message: problem });
      }
    }
  });

  return problems;
}

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

/** Ranges mirror the sliders: a value outside them would render nonsense. */
const NUMERIC_BOUNDS = {
  glowIntensity: { min: 0, max: 30, integer: true },
  glowOpacity: { min: 0, max: 100, integer: true },
  glowCoreSize: { min: 0, max: 10, integer: false },
  glowSpread: { min: 0, max: 30, integer: false },
  glowOutline: { min: 0, max: 5, integer: false },
} as const;

const COLOUR_FIELDS = [
  'backgroundColor', 'titleColor', 'stateWithMediaColor', 'stateDisabledColor',
  'stateHoverColor', 'stateSelectedColor', 'coverageOriginColor', 'coverageAreaColor',
  'glowColor', 'accentColor',
] as const satisfies readonly (keyof Appearance)[];

export function validateAppearance(input: Appearance): Problem[] {
  const problems: Problem[] = [];

  for (const field of COLOUR_FIELDS) {
    const value = input[field];
    if (typeof value !== 'string' || !HEX_COLOUR.test(value)) {
      problems.push({ field, message: 'Debe ser un color hexadecimal como #08783f.' });
    }
  }

  for (const [field, bounds] of Object.entries(NUMERIC_BOUNDS)) {
    const value = input[field as keyof typeof NUMERIC_BOUNDS];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      problems.push({ field, message: 'Debe ser un número.' });
      continue;
    }
    if (bounds.integer && !Number.isInteger(value)) {
      problems.push({ field, message: 'Debe ser un número entero.' });
    }
    if (value < bounds.min || value > bounds.max) {
      problems.push({ field, message: `Debe estar entre ${bounds.min} y ${bounds.max}.` });
    }
  }

  return problems;
}
