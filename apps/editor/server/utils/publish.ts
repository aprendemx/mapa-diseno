import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { MEDIA_STOP_SCRIPT, generateMapData, renderMap } from '@mapa-mexico/map-generator'
import type { MapData } from '@mapa-mexico/map-generator'
import { checkPublishable, fromRows } from '@mapa-mexico/project-store'
import type { MapRow, Problem } from '@mapa-mexico/project-store'
import { pointRootAt, statStored, writeFileAtomic } from '@mapa-mexico/file-storage'
import {
  getPublication,
  latestPublication,
  readCatalog,
  recordPublication,
} from '@mapa-mexico/postgres'
import type { Pooled, PublicationSummary, SessionUser } from '@mapa-mexico/postgres'

export interface PublishRefusal {
  ok: false
  problems: Problem[]
}

export interface PublishSuccess {
  ok: true
  publication: PublicationSummary
  bytes: number
  /** La página se regeneró, pero el contenido era el mismo que ya estaba. */
  unchanged: boolean
}

/**
 * La plantilla se lee al publicar, asi que un `mapa-base.html` corregido toma
 * efecto en la publicacion siguiente sin reconstruir la imagen. El script que
 * detiene la multimedia viaja dentro del paquete: una ruta a `src/` resuelve en
 * desarrollo y no en un contenedor.
 */
async function readTemplate(): Promise<string> {
  return readFile(resolve(useRuntimeConfig().templatePath), 'utf8')
}

const existsIn = (root: string) => async (path: string) =>
  Boolean(await statStored(root, path))

/** Revisa un mapa sin tocar nada. Tambien es el primer paso de publicar. */
export async function inspect(db: Pooled, map: MapRow): Promise<Problem[]> {
  const project = fromRows(await readCatalog(db, map.id))
  return checkPublishable(project, existsIn(mapRoot(map)))
}

/**
 * Escribe la pagina del mapa en su propio directorio.
 *
 * `<sitio>/<slug>/index.html`, al lado de su `contenidos/`. Por eso la pagina
 * puede seguir referenciando rutas relativas sin saber en que ruta se sirve:
 * es lo que permite que varios mapas convivan en un dominio sin reescribir
 * ninguna ruta almacenada.
 */
async function put(map: MapRow, data: MapData): Promise<number> {
  const html = renderMap({ template: await readTemplate(), mediaStop: MEDIA_STOP_SCRIPT, data })
  await writeFileAtomic(join(mapRoot(map), 'index.html'), html)

  // Si este mapa es el de la raíz, asegurar los enlaces en cada publicación.
  // Es idempotente, y cubre el primer despliegue y el caso de que alguien los
  // haya borrado: sin ellos el dominio no entrega nada en `/` y la publicación
  // habría dicho que todo salió bien.
  if (map.is_default) {
    await pointRootAt(useRuntimeConfig().siteRoot, map.slug)
  }
  return Buffer.byteLength(html)
}

/**
 * Valida, genera y reemplaza — en ese orden, y nada antes de su turno.
 *
 * El generador viejo validaba *despues* de haber escrito el JSON, movido los
 * archivos y borrado los huerfanos, asi que un fallo dejaba el disco cambiado y
 * el mapa publicado viejo. Aqui un rechazo significa que no paso nada.
 */
export async function publishCatalogue(
  db: Pooled,
  map: MapRow,
  user: SessionUser,
): Promise<PublishRefusal | PublishSuccess> {
  const project = fromRows(await readCatalog(db, map.id))

  const problems = await checkPublishable(project, existsIn(mapRoot(map)))
  if (problems.length > 0) return { ok: false, problems }

  const data = generateMapData(project)
  const bytes = await put(map, data)

  // Publicar dos veces sin cambios regenera la página, pero no merece otra
  // entrada en el historial. Veinte entradas idénticas no se pueden navegar, y
  // navegarlo es justamente para lo que existe: elegir a cuál volver.
  const previous = await latestPublication(db, map.id)
  const unchanged = previous
    ? JSON.stringify((await getPublication(db, map.id, previous.id))?.mapData) ===
      JSON.stringify(data)
    : false

  if (unchanged && previous) {
    return { ok: true, publication: previous, bytes, unchanged: true }
  }

  const publication = await recordPublication(db, {
    mapId: map.id,
    userId: user.id,
    userName: user.name,
    mapData: data,
  })
  return { ok: true, publication, bytes, unchanged: false }
}

/**
 * Vuelve a publicar los datos de una publicacion anterior de ESE mapa.
 *
 * Renderiza de nuevo en lugar de restaurar HTML guardado, asi que recoge la
 * plantilla actual — que es lo que se quiere cuando la restauracion existe
 * porque algo de la pagina fallo. Y no toca el catalogo: volver atras el sitio
 * no es deshacer las ediciones de alguien.
 */
export async function restorePublication(
  db: Pooled,
  map: MapRow,
  user: SessionUser,
  publicationId: string,
): Promise<PublishSuccess | undefined> {
  const previous = await getPublication(db, map.id, publicationId)
  if (!previous) return undefined

  const bytes = await put(map, previous.mapData)
  // Una restauración siempre se registra, incluso si el contenido coincide con
  // lo que ya estaba: lo que importa asentar es que alguien decidió volver.
  const publication = await recordPublication(db, {
    mapId: map.id,
    userId: user.id,
    userName: user.name,
    mapData: previous.mapData,
    restoredFrom: previous.id,
  })
  return { ok: true, publication, bytes, unchanged: false }
}
