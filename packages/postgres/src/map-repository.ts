import { appearanceToRow } from '@mapa-mexico/project-store';
import type { MapRow } from '@mapa-mexico/project-store';
import type { Appearance } from '@mapa-mexico/map-generator';

import { withTransaction, type Pooled, type Queryable } from './queryable.ts';

const COLUMNS = 'id, slug, name, is_default';

/**
 * Slugs que no puede llevar un mapa porque taparian otra cosa en el dominio.
 *
 * El esquema lo repite como check: la validacion de aqui da un mensaje
 * legible, y la del almacenamiento garantiza que un camino que la esquive no
 * pueda dejar el editor inalcanzable.
 */
export const RESERVED_SLUGS = new Set([
  'admin', 'editor', 'api', 'contenidos', 'index', '_nuxt', 'assets',
]);

export const SLUG_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function listMaps(db: Queryable): Promise<MapRow[]> {
  const result = await db.query(
    `select ${COLUMNS} from maps order by is_default desc, name`,
  );
  return result.rows as MapRow[];
}

export async function getMap(db: Queryable, id: string): Promise<MapRow | undefined> {
  const result = await db.query(`select ${COLUMNS} from maps where id = $1`, [id]);
  return result.rows[0] as MapRow | undefined;
}

export async function getMapBySlug(db: Queryable, slug: string): Promise<MapRow | undefined> {
  const result = await db.query(`select ${COLUMNS} from maps where slug = $1`, [slug]);
  return result.rows[0] as MapRow | undefined;
}

/** El que se sirve en la raiz del dominio. */
export async function getDefaultMap(db: Queryable): Promise<MapRow | undefined> {
  const result = await db.query(`select ${COLUMNS} from maps where is_default`);
  return result.rows[0] as MapRow | undefined;
}

/**
 * Crea un mapa con su apariencia.
 *
 * Las dos cosas en una transaccion: un mapa sin fila de apariencia no se puede
 * abrir en el editor ni publicar, y la clave primaria de `appearance` hace que
 * no haya forma de arreglarlo salvo creandola.
 */
export async function createMap(
  db: Pooled,
  map: { slug: string; name: string; appearance: Appearance; isDefault?: boolean },
): Promise<MapRow> {
  return withTransaction(db, async (tx) => {
    if (map.isDefault) {
      // El indice unico parcial solo admite un `true`, asi que el anterior
      // tiene que dejar de serlo antes y no despues.
      await tx.query('update maps set is_default = false where is_default');
    }

    const created = await tx.query(
      `insert into maps (slug, name, is_default) values ($1, $2, $3) returning ${COLUMNS}`,
      [map.slug, map.name, map.isDefault === true],
    );
    const row = created.rows[0] as MapRow;

    const appearance = appearanceToRow(map.appearance, row.id);
    const columns = Object.keys(appearance);
    await tx.query(
      `insert into appearance (${columns.join(', ')})
       values (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      columns.map((column) => appearance[column as keyof typeof appearance]),
    );

    return row;
  });
}

export async function renameMap(db: Queryable, id: string, name: string): Promise<boolean> {
  const result = await db.query(
    'update maps set name = $2 where id = $1 returning id',
    [id, name],
  );
  return result.rows.length > 0;
}

/**
 * Cambia cual es el mapa de la raiz.
 *
 * No mueve archivos: la raiz del sitio son dos enlaces simbolicos al directorio
 * del mapa por defecto, y repuntarlos es trabajo del publicador.
 */
export async function setDefaultMap(db: Pooled, id: string): Promise<boolean> {
  return withTransaction(db, async (tx) => {
    // Comprobar primero y desmarcar despues, en ese orden.
    //
    // Al reves --desmarcar y luego intentar marcar-- un id que no existe deja
    // cero mapas predeterminados y la transaccion confirma igual, porque no
    // hubo ningun error: la raiz del dominio se queda sin nada que servir.
    const exists = await tx.query('select 1 from maps where id = $1', [id]);
    if (exists.rows.length === 0) return false;

    await tx.query('update maps set is_default = false where is_default');
    await tx.query('update maps set is_default = true where id = $1', [id]);
    return true;
  });
}

/** Borra el mapa y, por cascada, su catalogo, apariencia e historial. */
export async function deleteMap(db: Queryable, id: string): Promise<boolean> {
  const result = await db.query('delete from maps where id = $1 returning id', [id]);
  return result.rows.length > 0;
}
