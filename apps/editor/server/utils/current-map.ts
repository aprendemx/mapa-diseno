import type { H3Event } from 'h3'
import type { MapRow } from '@mapa-mexico/project-store'
import { getDefaultMap, getMapBySlug } from '@mapa-mexico/postgres'
import { resolve } from 'node:path'

/**
 * El mapa sobre el que opera la peticion.
 *
 * Por ahora: el de la raiz, o el que indique `?mapa=<slug>`. Cuando el editor
 * tenga su selector, el slug vendra de la ruta y este resolvedor seguira
 * siendo el unico lugar que lo decide — que es el punto de tenerlo aparte.
 */
export async function currentMap(event: H3Event): Promise<MapRow> {
  const slug = (getQuery(event)['mapa'] as string | undefined)?.trim()

  const map = slug
    ? await getMapBySlug(database(), slug)
    : await getDefaultMap(database())

  if (!map) {
    throw createError({
      statusCode: slug ? 404 : 500,
      statusMessage: slug
        ? `No existe el mapa "${slug}".`
        : 'No hay ningún mapa marcado como predeterminado.',
    })
  }
  return map
}

/**
 * El arbol de ese mapa dentro del sitio: `<sitio>/<slug>/`.
 *
 * Cada mapa tiene su propio `contenidos/`, y es lo que hace que la pagina
 * publicada pueda seguir referenciando rutas relativas sin saber donde vive.
 */
export function mapRoot(map: MapRow): string {
  return resolve(useRuntimeConfig().siteRoot, map.slug)
}
