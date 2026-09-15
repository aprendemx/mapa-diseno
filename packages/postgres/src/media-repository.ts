import type { Appearance } from '@mapa-mexico/map-generator';
import { appearanceFromRow, appearanceToRow, uniqueSlug } from '@mapa-mexico/project-store';
import type { AppearanceRow, MediumInput, SocialNetwork } from '@mapa-mexico/project-store';

import { withTransaction, type Pooled, type Queryable } from './queryable.ts';

const NETWORKS: readonly SocialNetwork[] = ['instagram', 'facebook', 'x', 'tiktok', 'youtube'];

export interface MediumSummary {
  id: string;
  name: string;
  active: boolean;
  stateId: string | null;
  stateName: string | null;
  position: number;
  fileCount: number;
  themeCount: number;
  noteCount: number;
}

export interface MediumDetail extends Omit<MediumInput, 'socialThemes'> {
  id: string;
  position: number;
  files: { id: string; kind: string; path: string; description: string; position: number }[];
  /**
   * Themes carry their position too, because files and themes share one
   * ordering space: the editor has to merge the two lists to show the order
   * the map will actually publish.
   */
  socialThemes: (MediumInput['socialThemes'][number] & { position: number })[];
}

export interface StateOption {
  id: string;
  name: string;
}

export async function listStates(db: Queryable): Promise<StateOption[]> {
  const result = await db.query('select id, name from states order by position');
  return result.rows as StateOption[];
}

/**
 * The list view, in one query.
 *
 * Counts are computed in SQL rather than by loading every medium's children:
 * the list shows "4 archivos, 2 temas" and nothing more, and fetching the rows
 * to count them would be the classic N+1 the schema exists to avoid.
 */
export async function listMedia(db: Queryable): Promise<MediumSummary[]> {
  const result = await db.query(`
    select m.id, m.name, m.active, m.state_id, s.name as state_name, m.position,
           (select count(*) from media_files f where f.medium_id = m.id)::int as file_count,
           (select count(*) from social_themes t where t.medium_id = m.id)::int as theme_count,
           coalesce(array_length(
             array_remove(regexp_split_to_array(btrim(m.notes), '\\s*\\r?\\n\\s*'), ''), 1
           ), 0) as note_count
      from media m
      left join states s on s.id = m.state_id
     order by m.position
  `);

  return (result.rows as Record<string, unknown>[]).map((row) => ({
    id: row['id'] as string,
    name: row['name'] as string,
    active: row['active'] as boolean,
    stateId: (row['state_id'] as string | null) ?? null,
    stateName: (row['state_name'] as string | null) ?? null,
    position: row['position'] as number,
    fileCount: row['file_count'] as number,
    themeCount: row['theme_count'] as number,
    noteCount: row['note_count'] as number,
  }));
}

export async function getMedium(db: Queryable, id: string): Promise<MediumDetail | undefined> {
  const medium = await db.query(
    `select id, name, active, state_id, notes, coverage_text, social_enabled, position
       from media where id = $1`,
    [id],
  );
  const row = medium.rows[0] as Record<string, unknown> | undefined;
  if (!row) return undefined;

  const coverage = await db.query(
    'select state_id from media_coverage_states where medium_id = $1 order by position',
    [id],
  );
  const themes = await db.query(
    `select id, title, instagram, facebook, x, tiktok, youtube, witness_position
       from social_themes where medium_id = $1 order by witness_position`,
    [id],
  );
  const files = await db.query(
    `select id, kind, path, description, witness_position
       from media_files where medium_id = $1 order by witness_position`,
    [id],
  );

  return {
    id: row['id'] as string,
    name: row['name'] as string,
    active: row['active'] as boolean,
    stateId: (row['state_id'] as string | null) ?? null,
    notes: row['notes'] as string,
    coverageText: row['coverage_text'] as string,
    socialEnabled: row['social_enabled'] as boolean,
    position: row['position'] as number,
    coverageStates: (coverage.rows as { state_id: string }[]).map((r) => r.state_id),
    socialThemes: (themes.rows as Record<string, unknown>[]).map((theme) => ({
      id: theme['id'] as string,
      title: theme['title'] as string,
      position: theme['witness_position'] as number,
      links: Object.fromEntries(
        NETWORKS.map((network) => [network, (theme[network] as string | undefined) ?? '']),
      ) as Record<SocialNetwork, string>,
    })),
    files: (files.rows as Record<string, unknown>[]).map((file) => ({
      id: file['id'] as string,
      kind: file['kind'] as string,
      path: file['path'] as string,
      description: file['description'] as string,
      position: file['witness_position'] as number,
    })),
  };
}

/**
 * Mints the id from the name, once.
 *
 * After this the id never changes again, however often the medium is renamed.
 * Every campaign the map publishes is keyed `<mediumId>-nota-N`, so a moving
 * id would silently renumber published references.
 */
export async function createMedium(db: Pooled, input: MediumInput): Promise<string> {
  const existing = await db.query('select id from media');
  const taken = new Set((existing.rows as { id: string }[]).map((row) => row.id));
  const id = uniqueSlug(input.name, taken);

  return withTransaction(db, async (tx) => {
    await tx.query(
      `insert into media (id, name, active, state_id, notes, coverage_text, social_enabled, position)
       values ($1, $2, $3, $4, $5, $6, $7,
               (select coalesce(max(position), 0) + 1 from media))`,
      [
        id,
        input.name.trim(),
        input.active,
        input.stateId,
        input.notes,
        input.coverageText,
        input.socialEnabled,
      ],
    );
    await writeCoverage(tx, id, input.coverageStates);
    await writeThemes(tx, id, input.socialThemes);
    return id;
  });
}

export async function updateMedium(
  db: Pooled,
  id: string,
  input: MediumInput,
): Promise<boolean> {
  return withTransaction(db, async (tx) => {
    const updated = await tx.query(
      `update media set name = $2, active = $3, state_id = $4, notes = $5,
              coverage_text = $6, social_enabled = $7, updated_at = now()
        where id = $1 returning id`,
      [
        id,
        input.name.trim(),
        input.active,
        input.stateId,
        input.notes,
        input.coverageText,
        input.socialEnabled,
      ],
    );
    if (updated.rows.length === 0) return false;

    await writeCoverage(tx, id, input.coverageStates);
    await writeThemes(tx, id, input.socialThemes);
    return true;
  });
}

export async function deleteMedium(db: Queryable, id: string): Promise<boolean> {
  // Coverage, files and themes go with it by cascade. The blobs on disk do
  // not: unlinking a record must never be what deletes someone's video.
  const result = await db.query('delete from media where id = $1 returning id', [id]);
  return result.rows.length > 0;
}

/** Reorders the list. Positions are rewritten from 1 so no gaps accumulate. */
export async function reorderMedia(db: Pooled, orderedIds: string[]): Promise<void> {
  await withTransaction(db, async (tx) => {
    await tx.query(
      `update media set position = data.position
         from (select unnest($1::text[]) as id, generate_subscripts($1::text[], 1) as position)
              as data
        where media.id = data.id`,
      [orderedIds],
    );
  });
}

async function writeCoverage(db: Queryable, mediumId: string, stateIds: string[]): Promise<void> {
  await db.query('delete from media_coverage_states where medium_id = $1', [mediumId]);
  if (stateIds.length === 0) return;

  await db.query(
    `insert into media_coverage_states (medium_id, state_id, position)
     select $1, id, position
       from unnest($2::text[]) with ordinality as t(id, position)`,
    [mediumId, stateIds],
  );
}

/**
 * Replaces the medium's themes while leaving its files exactly where they are.
 *
 * Files and themes share one ordering space, so a naive "delete all, reinsert"
 * would renumber the files too and shuffle the map. Themes that already exist
 * keep the position they had; new ones are appended past the current maximum.
 */
async function writeThemes(
  db: Queryable,
  mediumId: string,
  themes: MediumInput['socialThemes'],
): Promise<void> {
  const current = await db.query(
    'select id, witness_position from social_themes where medium_id = $1',
    [mediumId],
  );
  const positionById = new Map(
    (current.rows as { id: string; witness_position: number }[]).map((row) => [
      row.id,
      row.witness_position,
    ]),
  );

  const highest = await db.query(
    `select coalesce(max(witness_position), 0)::int as top from (
       select witness_position from media_files where medium_id = $1
       union all
       select witness_position from social_themes where medium_id = $1
     ) as witnesses`,
    [mediumId],
  );
  let next = (highest.rows[0] as { top: number }).top;

  await db.query('delete from social_themes where medium_id = $1', [mediumId]);
  if (themes.length === 0) return;

  const rows = themes.map((theme) => {
    const id = theme.id && positionById.has(theme.id) ? theme.id : undefined;
    const position = id ? positionById.get(id)! : (next += 1);
    return {
      id: id ?? `${mediumId}-social-${position}`,
      position,
      title: theme.title.trim(),
      links: theme.links,
    };
  });

  const values: unknown[] = [];
  const tuples = rows.map((row, index) => {
    const base = index * 9;
    values.push(
      row.id, mediumId, row.title,
      ...NETWORKS.map((network) => (row.links[network] ?? '').trim()),
      row.position,
    );
    return `(${Array.from({ length: 9 }, (_, i) => `$${base + i + 1}`).join(', ')})`;
  });

  await db.query(
    `insert into social_themes
       (id, medium_id, title, instagram, facebook, x, tiktok, youtube, witness_position)
     values ${tuples.join(', ')}`,
    values,
  );
}

/** Reuses the row mapping that `project-store` already owns, rather than
 * writing a second copy of it that can drift. */
export async function getAppearance(db: Queryable): Promise<Appearance> {
  const result = await db.query(`
    select background_color, title_color, state_with_media_color, state_disabled_color,
           state_hover_color, state_selected_color, coverage_origin_color, coverage_area_color,
           glow_color, glow_intensity, glow_opacity, glow_core_size, glow_spread,
           glow_outline, accent_color
      from appearance where singleton
  `);
  const row = result.rows[0] as AppearanceRow | undefined;
  if (!row) throw new Error('The appearance row is missing: the catalogue was never initialised.');
  return appearanceFromRow(row);
}

export async function updateAppearance(db: Queryable, appearance: Appearance): Promise<void> {
  const row = appearanceToRow(appearance);
  const columns = Object.keys(row) as (keyof AppearanceRow)[];
  await db.query(
    `update appearance set ${columns.map((c, i) => `${c} = $${i + 1}`).join(', ')} where singleton`,
    columns.map((column) => row[column]),
  );
}
