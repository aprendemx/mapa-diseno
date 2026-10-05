import type {
  Appearance,
  Medium,
  Project,
  SocialLinks,
} from './domain/project.ts';
import type {
  Flag,
  MapCampaign,
  MapContent,
  MapCoverage,
  MapData,
  MapMedium,
  MapState,
} from './domain/map-data.ts';

/**
 * PowerShell coerces `$null` to the empty string on `[string]` casts, and the
 * legacy generator leans on that everywhere. Reproducing it explicitly keeps
 * a missing field from surfacing as the literal "undefined".
 */
const str = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);

const blank = (value: string): boolean => value.trim() === '';

/** The map's contract: flags travel as '1'/'0' strings, never as booleans. */
const flag = (value: unknown): Flag => (value ? '1' : '0');

const SOCIAL_NETWORKS = ['instagram', 'facebook', 'x', 'tiktok', 'youtube'] as const;

export const APPEARANCE_DEFAULTS: Appearance = {
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
};

const COLOR_KEYS = [
  'backgroundColor',
  'titleColor',
  'stateWithMediaColor',
  'stateDisabledColor',
  'stateHoverColor',
  'stateSelectedColor',
  'coverageOriginColor',
  'coverageAreaColor',
  'glowColor',
  'accentColor',
] as const satisfies readonly (keyof Appearance)[];

const INTEGER_KEYS = ['glowIntensity', 'glowOpacity'] as const;
const DECIMAL_KEYS = ['glowCoreSize', 'glowSpread', 'glowOutline'] as const;

/**
 * Colours fall back on any falsy value — an empty string does not override a
 * default. Numbers fall back only on null/undefined, so an explicit 0 is kept.
 * That asymmetry is the legacy behaviour, not an oversight.
 */
function resolveAppearance(source: Partial<Appearance> | undefined): Appearance {
  const resolved: Appearance = { ...APPEARANCE_DEFAULTS };
  if (!source) return resolved;

  for (const key of COLOR_KEYS) {
    const value = source[key];
    if (value) resolved[key] = String(value);
  }
  for (const key of INTEGER_KEYS) {
    const value = source[key];
    if (value !== null && value !== undefined) resolved[key] = Math.round(Number(value));
  }
  for (const key of DECIMAL_KEYS) {
    const value = source[key];
    if (value !== null && value !== undefined) resolved[key] = Number(value);
  }
  return resolved;
}

/** Origin state first, then manual additions: deduplicated, origin removed. */
function resolveCoverageStates(medium: Medium, originId: string): string[] {
  const seen = new Set<string>();
  const states: string[] = [];
  for (const raw of medium.coverageStates ?? []) {
    const id = str(raw);
    if (!id || id === originId || seen.has(id)) continue;
    seen.add(id);
    states.push(id);
  }
  return states;
}

/** One campaign per non-blank line of `notes`, numbered within the medium. */
function buildCampaigns(medium: Medium, active: Flag): MapCampaign[] {
  const campaigns: MapCampaign[] = [];
  const mediumId = str(medium.id);
  let order = 0;

  for (const line of str(medium.notes).split(/\r?\n/)) {
    if (blank(line)) continue;
    order += 1;
    campaigns.push({
      id: `${mediumId}-nota-${order}`,
      stateId: str(medium.stateId),
      mediumId,
      name: line.trim(),
      active,
      order,
    });
  }
  return campaigns;
}

/**
 * Files and social themes share one list in the map, ordered by the editor's
 * `witnessOrder`. Ids that list does not know are appended in natural order —
 * files first, then themes — and ids it names but that no longer exist are
 * dropped. Nothing is lost to a stale ordering.
 */
function buildContents(medium: Medium, active: Flag): MapContent[] {
  const byId = new Map<string, MapContent>();
  const natural: string[] = [];
  const stateId = str(medium.stateId);
  const mediumId = str(medium.id);

  for (const file of medium.files ?? []) {
    const path = str(file.file);
    if (blank(path)) continue;
    const id = str(file.id) || `${mediumId}-archivo-${natural.length + 1}`;
    byId.set(id, {
      id,
      stateId,
      mediumId,
      type: file.type,
      file: path.replaceAll('\\', '/'),
      description: str(file.description),
      active,
      order: 0,
    });
    natural.push(id);
  }

  if (medium.socialEnabled === true) {
    let position = 0;
    for (const theme of medium.socialThemes ?? []) {
      position += 1;
      const id = str(theme.id) || `${mediumId}-social-${position}`;

      const links: SocialLinks = { instagram: '', facebook: '', x: '', tiktok: '', youtube: '' };
      for (const network of SOCIAL_NETWORKS) {
        const value = str(theme.links?.[network]);
        if (!blank(value)) links[network] = value.trim();
      }
      // A theme with no link at all has nothing to show, so it never ships.
      if (SOCIAL_NETWORKS.every((network) => blank(links[network]))) continue;

      const title = str(theme.title);
      byId.set(id, {
        id,
        stateId,
        mediumId,
        type: 'social',
        theme: blank(title) ? `Tema ${position}` : title.trim(),
        links,
        active,
        order: 0,
      });
      natural.push(id);
    }
  }

  const contents: MapContent[] = [];
  const placed = new Set<string>();

  for (const raw of medium.witnessOrder ?? []) {
    const id = str(raw);
    const item = byId.get(id);
    if (!item || placed.has(id)) continue;
    placed.add(id);
    contents.push(item);
  }
  for (const id of natural) {
    if (placed.has(id)) continue;
    placed.add(id);
    contents.push(byId.get(id)!);
  }

  contents.forEach((item, index) => {
    item.order = index + 1;
  });
  return contents;
}

/**
 * Projects the authoring model onto the six flat tables the published map
 * consumes.
 *
 * Pure: no filesystem, no clock, no randomness. Cross-record validation
 * (state catalogue size, duplicate ids, missing files on disk) is a concern of
 * the publish pipeline, not of this projection.
 */
export function generateMapData(project: Project): MapData {
  const media: MapMedium[] = [];
  const coverage: MapCoverage[] = [];
  const campaigns: MapCampaign[] = [];
  const contents: MapContent[] = [];

  // A state lights up only when an *active* medium originates there.
  // Coverage alone never activates it.
  const originsWithActiveMedium = new Set(
    (project.media ?? [])
      .filter((medium) => medium.stateId && medium.active)
      .map((medium) => str(medium.stateId)),
  );

  const states: MapState[] = (project.states ?? []).map((state) => ({
    id: str(state.id),
    name: str(state.name),
    active: flag(originsWithActiveMedium.has(str(state.id))),
  }));

  let order = 0;
  for (const medium of project.media ?? []) {
    order += 1;
    const active = flag(medium.active);
    const originId = str(medium.stateId);
    const mediumId = str(medium.id);

    media.push({
      id: mediumId,
      name: str(medium.name),
      stateId: originId,
      coverageStates: resolveCoverageStates(medium, originId),
      coverageText: str(medium.coverageText),
      socialEnabled: medium.socialEnabled === true,
      active,
      order,
    });

    if (originId) {
      coverage.push({ stateId: originId, mediumId, order, active });
    }

    campaigns.push(...buildCampaigns(medium, active));
    contents.push(...buildContents(medium, active));
  }

  return {
    appearance: resolveAppearance(project.appearance),
    states,
    media,
    coverage,
    campaigns,
    contents,
  };
}
