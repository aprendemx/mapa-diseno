import type {
  AppearanceRow,
  CatalogRows,
  CoverageStateRow,
  MediaFileRow,
  MediumRow,
  SocialThemeRow,
  StateRow,
} from '@mapa-mexico/project-store';

import { placeholders, type Queryable } from './queryable.ts';

const APPEARANCE_COLUMNS = [
  'background_color', 'title_color', 'state_with_media_color', 'state_disabled_color',
  'state_hover_color', 'state_selected_color', 'coverage_origin_color', 'coverage_area_color',
  'glow_color', 'glow_intensity', 'glow_opacity', 'glow_core_size', 'glow_spread',
  'glow_outline', 'accent_color',
] as const;

const MEDIUM_COLUMNS = [
  'id', 'name', 'folder_slug', 'active', 'state_id', 'notes', 'coverage_text',
  'social_enabled', 'position',
] as const;

const FILE_COLUMNS = [
  'id', 'medium_id', 'kind', 'path', 'description', 'witness_position',
] as const;

const THEME_COLUMNS = [
  'id', 'medium_id', 'title', 'instagram', 'facebook', 'x', 'tiktok', 'youtube',
  'witness_position',
] as const;

const pick = <T extends object>(row: T, columns: readonly (keyof T)[]): unknown[] =>
  columns.map((column) => row[column]);

async function insertMany<T extends object>(
  db: Queryable,
  table: string,
  columns: readonly (keyof T & string)[],
  rows: T[],
): Promise<void> {
  if (rows.length === 0) return;
  const values = rows.flatMap((row) => pick(row, columns));
  await db.query(
    `insert into ${table} (${columns.join(', ')}) values ${placeholders(rows.length, columns.length)}`,
    values,
  );
}

/**
 * Reads the whole catalogue.
 *
 * Ordered by the same keys `toRows` canonicalises on, so what comes back out
 * of the database compares equal to what went in — without the caller having
 * to sort it first.
 */
export async function readCatalog(db: Queryable): Promise<CatalogRows> {
  const appearance = await db.query(
    `select ${APPEARANCE_COLUMNS.join(', ')} from appearance where singleton`,
  );
  if (appearance.rows.length === 0) {
    throw new Error('The appearance row is missing: the catalogue was never initialised.');
  }

  const states = await db.query('select id, name, position from states order by position');
  const media = await db.query(
    `select ${MEDIUM_COLUMNS.join(', ')} from media order by position`,
  );
  const coverageStates = await db.query(
    'select medium_id, state_id, position from media_coverage_states order by medium_id, position',
  );
  const files = await db.query(
    `select ${FILE_COLUMNS.join(', ')} from media_files order by medium_id, witness_position`,
  );
  const socialThemes = await db.query(
    `select ${THEME_COLUMNS.join(', ')} from social_themes order by medium_id, witness_position`,
  );

  return {
    appearance: appearance.rows[0] as AppearanceRow,
    states: states.rows as StateRow[],
    media: media.rows as MediumRow[],
    coverageStates: coverageStates.rows as CoverageStateRow[],
    files: files.rows as MediaFileRow[],
    socialThemes: socialThemes.rows as SocialThemeRow[],
  };
}

/**
 * Replaces the whole catalogue in one transaction.
 *
 * This is the import path — used to move the legacy document in, and to
 * restore a backup. Ordinary editing writes single rows; nothing in day-to-day
 * use should ever call this.
 */
export async function replaceCatalog(db: Queryable, rows: CatalogRows): Promise<void> {
  await db.query('begin');
  try {
    // media cascades to coverage, files and themes.
    await db.query('delete from media');

    await db.query(
      `insert into states (id, name, position) values ${placeholders(rows.states.length, 3)}
       on conflict (id) do update set name = excluded.name, position = excluded.position`,
      rows.states.flatMap((state) => [state.id, state.name, state.position]),
    );

    await db.query(
      `insert into appearance (singleton, ${APPEARANCE_COLUMNS.join(', ')})
       values (true, ${APPEARANCE_COLUMNS.map((_, i) => `$${i + 1}`).join(', ')})
       on conflict (singleton) do update set
       ${APPEARANCE_COLUMNS.map((column) => `${column} = excluded.${column}`).join(', ')}`,
      pick(rows.appearance, APPEARANCE_COLUMNS),
    );

    await insertMany(db, 'media', MEDIUM_COLUMNS, rows.media);
    await insertMany(db, 'media_coverage_states', ['medium_id', 'state_id', 'position'], rows.coverageStates);
    await insertMany(db, 'media_files', FILE_COLUMNS, rows.files);
    await insertMany(db, 'social_themes', THEME_COLUMNS, rows.socialThemes);

    await db.query('commit');
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}
