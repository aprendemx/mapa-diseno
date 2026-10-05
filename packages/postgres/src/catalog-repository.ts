import type {
  AppearanceRow,
  CatalogRows,
  MapRow,
  CoverageStateRow,
  MediaFileRow,
  MediumRow,
  SocialThemeRow,
  StateRow,
} from '@mapa-mexico/project-store';

import { placeholders, withTransaction, type Pooled, type Queryable } from './queryable.ts';

const APPEARANCE_COLUMNS = [
  'map_id',
  'background_color', 'title_color', 'state_with_media_color', 'state_disabled_color',
  'state_hover_color', 'state_selected_color', 'coverage_origin_color', 'coverage_area_color',
  'glow_color', 'glow_intensity', 'glow_opacity', 'glow_core_size', 'glow_spread',
  'glow_outline', 'accent_color',
] as const;

const MEDIUM_COLUMNS = [
  'id', 'map_id', 'name', 'folder_slug', 'active', 'state_id', 'notes', 'coverage_text',
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
 * Lee un mapa completo.
 *
 * Las filas hijas se acotan por su medio y el medio por su mapa, no por una
 * lista de ids que el llamante haya juntado: un `in (...)` construido afuera es
 * exactamente donde se cuela una fila del mapa vecino.
 *
 * El orden es el mismo que canonicaliza `toRows`, asi que lo que sale de la
 * base compara igual a lo que entro sin que nadie tenga que ordenarlo.
 */
export async function readCatalog(db: Queryable, mapId: string): Promise<CatalogRows> {
  const map = await db.query(
    'select id, slug, name, is_default from maps where id = $1',
    [mapId],
  );
  if (map.rows.length === 0) throw new Error(`No existe el mapa ${mapId}.`);

  const appearance = await db.query(
    `select ${APPEARANCE_COLUMNS.join(', ')} from appearance where map_id = $1`,
    [mapId],
  );
  if (appearance.rows.length === 0) {
    throw new Error(`El mapa ${mapId} no tiene fila de apariencia: quedo a medio crear.`);
  }

  const states = await db.query('select id, name, position from states order by position');
  const media = await db.query(
    `select ${MEDIUM_COLUMNS.join(', ')} from media where map_id = $1 order by position`,
    [mapId],
  );
  const coverageStates = await db.query(
    `select c.medium_id, c.state_id, c.position
       from media_coverage_states c join media m on m.id = c.medium_id
      where m.map_id = $1 order by c.medium_id, c.position`,
    [mapId],
  );
  const files = await db.query(
    `select ${FILE_COLUMNS.map((c) => `f.${c}`).join(', ')}
       from media_files f join media m on m.id = f.medium_id
      where m.map_id = $1 order by f.medium_id, f.witness_position`,
    [mapId],
  );
  const socialThemes = await db.query(
    `select ${THEME_COLUMNS.map((c) => `t.${c}`).join(', ')}
       from social_themes t join media m on m.id = t.medium_id
      where m.map_id = $1 order by t.medium_id, t.witness_position`,
    [mapId],
  );

  return {
    map: map.rows[0] as MapRow,
    appearance: appearance.rows[0] as AppearanceRow,
    states: states.rows as StateRow[],
    media: media.rows as MediumRow[],
    coverageStates: coverageStates.rows as CoverageStateRow[],
    files: files.rows as MediaFileRow[],
    socialThemes: socialThemes.rows as SocialThemeRow[],
  };
}

/**
 * Reemplaza el catalogo de UN mapa, en una transaccion.
 *
 * Es el camino de importacion: trae el documento legacy y restaura un
 * respaldo. La edicion diaria escribe filas sueltas; nada de uso corriente
 * deberia llamar a esto.
 *
 * El borrado inicial va acotado al mapa. Sin ese `where`, importar un mapa
 * vaciaria el catalogo de todos los demas.
 */
export async function replaceCatalog(db: Pooled, rows: CatalogRows): Promise<void> {
  const mapId = rows.map.id;

  await withTransaction(db, async (tx) => {
    // media cascades to coverage, files and themes.
    await tx.query('delete from media where map_id = $1', [mapId]);

    await tx.query(
      `insert into states (id, name, position) values ${placeholders(rows.states.length, 3)}
       on conflict (id) do update set name = excluded.name, position = excluded.position`,
      rows.states.flatMap((state) => [state.id, state.name, state.position]),
    );

    const appearanceUpdates = APPEARANCE_COLUMNS.filter((column) => column !== 'map_id');
    await tx.query(
      `insert into appearance (${APPEARANCE_COLUMNS.join(', ')})
       values (${APPEARANCE_COLUMNS.map((_, i) => `$${i + 1}`).join(', ')})
       on conflict (map_id) do update set
       ${appearanceUpdates.map((column) => `${column} = excluded.${column}`).join(', ')}`,
      pick(rows.appearance, APPEARANCE_COLUMNS),
    );

    await insertMany(tx, 'media', MEDIUM_COLUMNS, rows.media);
    await insertMany(tx, 'media_coverage_states', ['medium_id', 'state_id', 'position'], rows.coverageStates);
    await insertMany(tx, 'media_files', FILE_COLUMNS, rows.files);
    await insertMany(tx, 'social_themes', THEME_COLUMNS, rows.socialThemes);
  });
}
