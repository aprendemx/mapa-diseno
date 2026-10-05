import type { MapData } from '@mapa-mexico/map-generator';

import type { Queryable } from './queryable.ts';

export interface PublicationSummary {
  id: string;
  publishedAt: Date;
  publishedByName: string;
  mediaCount: number;
  noteCount: number;
  witnessCount: number;
  restoredFrom: string | null;
}

export interface PublicationRecord extends PublicationSummary {
  mapData: MapData;
}

const toSummary = (row: Record<string, unknown>): PublicationSummary => ({
  id: row['id'] as string,
  publishedAt: row['published_at'] as Date,
  publishedByName: row['published_by_name'] as string,
  mediaCount: row['media_count'] as number,
  noteCount: row['note_count'] as number,
  witnessCount: row['witness_count'] as number,
  restoredFrom: (row['restored_from'] as string | null) ?? null,
});

export async function recordPublication(
  db: Queryable,
  publication: {
    mapId: string;
    userId: string;
    userName: string;
    mapData: MapData;
    restoredFrom?: string | undefined;
  },
): Promise<PublicationSummary> {
  const { mapData } = publication;
  const result = await db.query(
    `insert into publications
       (map_id, published_by, published_by_name, map_data, media_count, note_count,
        witness_count, restored_from)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id, published_at, published_by_name, media_count, note_count,
               witness_count, restored_from`,
    [
      publication.mapId,
      publication.userId,
      publication.userName,
      JSON.stringify(mapData),
      mapData.media.length,
      mapData.campaigns.length,
      mapData.contents.length,
      publication.restoredFrom ?? null,
    ],
  );
  return toSummary(result.rows[0] as Record<string, unknown>);
}

export async function listPublications(
  db: Queryable,
  mapId: string,
  limit = 30,
): Promise<PublicationSummary[]> {
  const result = await db.query(
    `select id, published_at, published_by_name, media_count, note_count,
            witness_count, restored_from
       from publications where map_id = $1 order by published_at desc limit $2`,
    [mapId, limit],
  );
  return (result.rows as Record<string, unknown>[]).map(toSummary);
}

export async function getPublication(
  db: Queryable,
  mapId: string,
  id: string,
): Promise<PublicationRecord | undefined> {
  const result = await db.query(
    `select id, published_at, published_by_name, map_data, media_count,
            note_count, witness_count, restored_from
       from publications where map_id = $1 and id = $2`,
    [mapId, id],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return undefined;

  return { ...toSummary(row), mapData: row['map_data'] as MapData };
}

/** La que esta en linea para ese mapa, segun este sistema. */
export async function latestPublication(
  db: Queryable,
  mapId: string,
): Promise<PublicationSummary | undefined> {
  const [latest] = await listPublications(db, mapId, 1);
  return latest;
}
