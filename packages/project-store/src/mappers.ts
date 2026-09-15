import type {
  Appearance,
  MediaFile,
  Medium,
  Project,
  SocialTheme,
} from '@mapa-mexico/map-generator';

import type {
  AppearanceRow,
  CatalogRows,
  CoverageStateRow,
  MediaFileRow,
  MediumRow,
  SocialThemeRow,
  StateRow,
} from './rows.ts';

/**
 * The version the legacy document carried. It described the shape of
 * `proyecto.json`, which the database now replaces, so it is a constant of the
 * export rather than a stored column.
 */
export const PROJECT_VERSION = 4;

const str = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);

const blank = (value: string): boolean => value.trim() === '';

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const bucket = groups.get(id);
    if (bucket) bucket.push(row);
    else groups.set(id, [row]);
  }
  return groups;
}

const byWitness = <T extends { witness_position: number }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => a.witness_position - b.witness_position);

// --- Appearance ------------------------------------------------------------

export function appearanceToRow(appearance: Appearance): AppearanceRow {
  return {
    background_color: appearance.backgroundColor,
    title_color: appearance.titleColor,
    state_with_media_color: appearance.stateWithMediaColor,
    state_disabled_color: appearance.stateDisabledColor,
    state_hover_color: appearance.stateHoverColor,
    state_selected_color: appearance.stateSelectedColor,
    coverage_origin_color: appearance.coverageOriginColor,
    coverage_area_color: appearance.coverageAreaColor,
    glow_color: appearance.glowColor,
    glow_intensity: appearance.glowIntensity,
    glow_opacity: appearance.glowOpacity,
    glow_core_size: appearance.glowCoreSize,
    glow_spread: appearance.glowSpread,
    glow_outline: appearance.glowOutline,
    accent_color: appearance.accentColor,
  };
}

export function appearanceFromRow(row: AppearanceRow): Appearance {
  return {
    backgroundColor: row.background_color,
    titleColor: row.title_color,
    stateWithMediaColor: row.state_with_media_color,
    stateDisabledColor: row.state_disabled_color,
    stateHoverColor: row.state_hover_color,
    stateSelectedColor: row.state_selected_color,
    coverageOriginColor: row.coverage_origin_color,
    coverageAreaColor: row.coverage_area_color,
    glowColor: row.glow_color,
    glowIntensity: row.glow_intensity,
    glowOpacity: row.glow_opacity,
    glowCoreSize: row.glow_core_size,
    glowSpread: row.glow_spread,
    glowOutline: row.glow_outline,
    accentColor: row.accent_color,
  };
}

// --- Witness ordering ------------------------------------------------------

/**
 * Resolves the one order that files and themes share, applying the same rules
 * the legacy generator did: ids the stored order names come first, whatever it
 * omits is appended — files before themes — and ids it names that no longer
 * exist are dropped.
 *
 * After this runs the order is a property of the rows themselves. There is no
 * second copy left to drift out of sync.
 */
function resolveWitnessOrder(
  storedOrder: string[],
  fileIds: string[],
  themeIds: string[],
): Map<string, number> {
  const known = new Set([...fileIds, ...themeIds]);
  const placed = new Set<string>();
  const sequence: string[] = [];

  for (const raw of storedOrder) {
    const id = str(raw);
    if (!known.has(id) || placed.has(id)) continue;
    placed.add(id);
    sequence.push(id);
  }
  for (const id of [...fileIds, ...themeIds]) {
    if (placed.has(id)) continue;
    placed.add(id);
    sequence.push(id);
  }
  return new Map(sequence.map((id, index) => [id, index + 1]));
}

// --- Project -> rows -------------------------------------------------------

/**
 * Imports the authoring document into relational rows.
 *
 * Two deliberate cleanups happen here, and only these two. Files with a blank
 * path are dropped: the old generator skipped them at publish time, so they
 * never reached anyone, and the schema now refuses to hold them. Social themes
 * with no links are kept: an empty theme is someone midway through authoring,
 * not corruption, and publish is where it gets filtered.
 */
export function toRows(project: Project): CatalogRows {
  const states: StateRow[] = (project.states ?? []).map((state, index) => ({
    id: str(state.id),
    name: str(state.name),
    position: index + 1,
  }));

  const media: MediumRow[] = [];
  const coverageStates: CoverageStateRow[] = [];
  const files: MediaFileRow[] = [];
  const socialThemes: SocialThemeRow[] = [];

  (project.media ?? []).forEach((medium, index) => {
    const mediumId = str(medium.id);
    const originId = str(medium.stateId);

    media.push({
      id: mediumId,
      name: str(medium.name),
      folder_slug: str(medium.folderSlug),
      active: medium.active === true,
      state_id: originId === '' ? null : originId,
      notes: str(medium.notes),
      coverage_text: str(medium.coverageText),
      social_enabled: medium.socialEnabled === true,
      position: index + 1,
    });

    const seenCoverage = new Set<string>();
    for (const raw of medium.coverageStates ?? []) {
      const stateId = str(raw);
      if (!stateId || seenCoverage.has(stateId)) continue;
      seenCoverage.add(stateId);
      coverageStates.push({
        medium_id: mediumId,
        state_id: stateId,
        position: seenCoverage.size,
      });
    }

    const keptFiles: { row: Omit<MediaFileRow, 'witness_position'> }[] = [];
    for (const file of medium.files ?? []) {
      const path = str(file.file);
      if (blank(path)) continue;
      const id = str(file.id) || `${mediumId}-archivo-${keptFiles.length + 1}`;
      keptFiles.push({
        row: {
          id,
          medium_id: mediumId,
          kind: file.type,
          path: path.replaceAll('\\', '/'),
          description: str(file.description),
        },
      });
    }

    const keptThemes: { row: Omit<SocialThemeRow, 'witness_position'> }[] = [];
    (medium.socialThemes ?? []).forEach((theme, themeIndex) => {
      const id = str(theme.id) || `${mediumId}-social-${themeIndex + 1}`;
      keptThemes.push({
        row: {
          id,
          medium_id: mediumId,
          title: str(theme.title),
          instagram: str(theme.links?.instagram),
          facebook: str(theme.links?.facebook),
          x: str(theme.links?.x),
          tiktok: str(theme.links?.tiktok),
          youtube: str(theme.links?.youtube),
        },
      });
    });

    const positions = resolveWitnessOrder(
      (medium.witnessOrder ?? []).map(str),
      keptFiles.map((f) => f.row.id),
      keptThemes.map((t) => t.row.id),
    );

    // Emitted in witness order rather than in the order the source document
    // happened to list them. A table has no inherent order, but a canonical
    // one makes the import deterministic — and therefore diffable, which is
    // what you want when the thing being moved is production data.
    const place = <T extends { id: string }>(items: { row: T }[]) =>
      items
        .map(({ row }) => ({ ...row, witness_position: positions.get(row.id)! }))
        .sort((a, b) => a.witness_position - b.witness_position);

    files.push(...place(keptFiles));
    socialThemes.push(...place(keptThemes));
  });

  return {
    appearance: appearanceToRow(project.appearance),
    states,
    media,
    coverageStates,
    files,
    socialThemes,
  };
}

// --- Rows -> Project -------------------------------------------------------

/** Rebuilds the document the generator consumes out of the stored rows. */
export function fromRows(rows: CatalogRows): Project {
  const coverageByMedium = groupBy(rows.coverageStates, (row) => row.medium_id);
  const filesByMedium = groupBy(rows.files, (row) => row.medium_id);
  const themesByMedium = groupBy(rows.socialThemes, (row) => row.medium_id);

  const media: Medium[] = [...rows.media]
    .sort((a, b) => a.position - b.position)
    .map((row) => {
      const fileRows = byWitness(filesByMedium.get(row.id) ?? []);
      const themeRows = byWitness(themesByMedium.get(row.id) ?? []);

      const files: MediaFile[] = fileRows.map((file) => ({
        id: file.id,
        type: file.kind,
        file: file.path,
        description: file.description,
      }));

      const socialThemes: SocialTheme[] = themeRows.map((theme) => ({
        id: theme.id,
        title: theme.title,
        links: {
          instagram: theme.instagram,
          facebook: theme.facebook,
          x: theme.x,
          tiktok: theme.tiktok,
          youtube: theme.youtube,
        },
      }));

      // Derived, never stored twice: one sort over the shared ordering space.
      const witnessOrder = [...fileRows, ...themeRows]
        .sort((a, b) => a.witness_position - b.witness_position)
        .map((witness) => witness.id);

      return {
        id: row.id,
        name: row.name,
        folderSlug: row.folder_slug,
        active: row.active,
        stateId: row.state_id ?? '',
        notes: row.notes,
        coverageText: row.coverage_text,
        coverageStates: (coverageByMedium.get(row.id) ?? [])
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((coverage) => coverage.state_id),
        files,
        socialEnabled: row.social_enabled,
        socialThemes,
        witnessOrder,
      };
    });

  return {
    version: PROJECT_VERSION,
    appearance: appearanceFromRow(rows.appearance),
    states: [...rows.states]
      .sort((a, b) => a.position - b.position)
      .map((state) => ({ id: state.id, name: state.name })),
    media,
  };
}
