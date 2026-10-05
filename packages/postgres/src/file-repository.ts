import { withTransaction, type Pooled, type Queryable } from './queryable.ts';

export interface StoredFileRecord {
  id: string;
  mediumId: string;
  kind: string;
  path: string;
  description: string;
  position: number;
}

/**
 * Appends a file at the end of the medium's witness order.
 *
 * The position is taken across both files and themes, because they share one
 * ordering space — numbering files independently would interleave them by
 * accident the next time the map is published.
 */
export async function addFile(
  db: Queryable,
  file: {
    id: string;
    mapId: string;
    mediumId: string;
    kind: string;
    path: string;
    description?: string;
  },
): Promise<StoredFileRecord> {
  // El medio tiene que pertenecer al mapa. Sin esta comprobacion, un id de
  // medio ajeno adjunta el archivo al catalogo de otro mapa, y los bytes
  // quedan bajo un directorio que ese mapa no sirve.
  const owns = await db.query(
    'select 1 from media where id = $1 and map_id = $2',
    [file.mediumId, file.mapId],
  );
  if (owns.rows.length === 0) {
    throw new Error(`El medio ${file.mediumId} no pertenece al mapa ${file.mapId}.`);
  }

  const result = await db.query(
    `insert into media_files (id, medium_id, kind, path, description, witness_position)
     values ($1, $2, $3, $4, $5, (
       select coalesce(max(witness_position), 0) + 1 from (
         select witness_position from media_files where medium_id = $2
         union all
         select witness_position from social_themes where medium_id = $2
       ) as witnesses
     ))
     returning id, medium_id, kind, path, description, witness_position`,
    [file.id, file.mediumId, file.kind, file.path, file.description ?? ''],
  );

  const row = result.rows[0] as Record<string, unknown>;
  return {
    id: row['id'] as string,
    mediumId: row['medium_id'] as string,
    kind: row['kind'] as string,
    path: row['path'] as string,
    description: row['description'] as string,
    position: row['witness_position'] as number,
  };
}

export async function updateFileDescription(
  db: Queryable,
  mapId: string,
  mediumId: string,
  fileId: string,
  description: string,
): Promise<boolean> {
  const result = await db.query(
    `update media_files f set description = $4
       where f.medium_id = $2 and f.id = $3
         and exists (select 1 from media m where m.id = f.medium_id and m.map_id = $1)
     returning f.id`,
    [mapId, mediumId, fileId, description],
  );
  return result.rows.length > 0;
}

/**
 * Unlinks a file from its medium and hands back the path it used to hold.
 *
 * The bytes are left exactly where they are. The old editor deleted, on every
 * single save, any file under `contenidos/` that the incoming payload did not
 * mention — so one client-side bug, or one half-sent request, was enough to
 * erase real video. Deleting media is now a separate, deliberate act: see the
 * orphan sweep.
 */
export async function removeFile(
  db: Queryable,
  mapId: string,
  mediumId: string,
  fileId: string,
): Promise<string | undefined> {
  const result = await db.query(
    `delete from media_files f
       where f.medium_id = $2 and f.id = $3
         and exists (select 1 from media m where m.id = f.medium_id and m.map_id = $1)
     returning f.path`,
    [mapId, mediumId, fileId],
  );
  return (result.rows[0] as { path: string } | undefined)?.path;
}

/**
 * Rewrites the shared order from a single list of ids.
 *
 * Ids the medium does not own are ignored rather than rejected: a stale tab
 * reordering a witness someone else deleted should not fail the whole save.
 */
export async function reorderWitnesses(
  db: Pooled,
  mapId: string,
  mediumId: string,
  orderedIds: string[],
): Promise<void> {
  await withTransaction(db, async (tx) => {
    const owns = await tx.query(
      'select 1 from media where id = $1 and map_id = $2',
      [mediumId, mapId],
    );
    if (owns.rows.length === 0) {
      throw new Error(`El medio ${mediumId} no pertenece al mapa ${mapId}.`);
    }
    // Park everything out of the way first. Without this, rewriting positions
    // one by one can transiently collide with a position still held by another
    // row, and the intermediate state is visible to anything reading.
    await tx.query(
      'update media_files set witness_position = witness_position + 100000 where medium_id = $1',
      [mediumId],
    );
    await tx.query(
      'update social_themes set witness_position = witness_position + 100000 where medium_id = $1',
      [mediumId],
    );

    for (const table of ['media_files', 'social_themes']) {
      await tx.query(
        `update ${table} set witness_position = data.position
           from (select unnest($2::text[]) as id,
                        generate_subscripts($2::text[], 1) as position) as data
          where ${table}.medium_id = $1 and ${table}.id = data.id`,
        [mediumId, orderedIds],
      );
    }

    // Anything the list did not name keeps its relative order, just after.
    for (const table of ['media_files', 'social_themes']) {
      await tx.query(
        `update ${table} set witness_position = witness_position - 100000 + $2
          where medium_id = $1 and witness_position > 100000`,
        [mediumId, orderedIds.length],
      );
    }

  });
}

/**
 * Las rutas que el catalogo de un mapa todavia referencia.
 *
 * Por mapa y no globales: cada mapa tiene su propio arbol de multimedia, asi
 * que un barrido que comparara contra las rutas de todos los mapas conservaria
 * huerfanos ajenos, y uno que ignorara el mapa borraria archivos vivos.
 */
export async function listReferencedPaths(
  db: Queryable,
  mapId: string,
): Promise<Set<string>> {
  const result = await db.query(
    `select f.path from media_files f join media m on m.id = f.medium_id
      where m.map_id = $1`,
    [mapId],
  );
  return new Set((result.rows as { path: string }[]).map((row) => row.path));
}
