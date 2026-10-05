import type { H3Event } from 'h3'
import type { MapRow } from '@mapa-mexico/project-store'
import { getMapBySlug } from '@mapa-mexico/postgres'
import { resolve } from 'node:path'

/**
 * El mapa sobre el que opera la petición, tomado de la ruta.
 *
 * De la ruta y no de una cookie o de un valor por omisión a propósito: una
 * petición que no dice en qué mapa escribe es una petición que puede escribir
 * en el equivocado, y eso es justo lo que el aislamiento del adaptador existe
 * para impedir. Si la URL lo dice, no hay nada que adivinar.
 */
export async function currentMap(event: H3Event): Promise<MapRow> {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Falta el mapa en la ruta.' })
  }

  const map = await getMapBySlug(database(), slug)
  if (!map) {
    throw createError({ statusCode: 404, statusMessage: `No existe el mapa "${slug}".` })
  }
  return map
}

/**
 * El árbol de ese mapa dentro del sitio: `<sitio>/<slug>/`.
 *
 * Cada mapa tiene su propio `contenidos/`, y es lo que permite que la página
 * publicada siga referenciando rutas relativas sin saber en qué ruta se sirve.
 */
export function mapRoot(map: MapRow): string {
  return resolve(useRuntimeConfig().siteRoot, map.slug)
}
