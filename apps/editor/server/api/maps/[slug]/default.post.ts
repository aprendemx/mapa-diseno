import { pointRootAt } from '@mapa-mexico/file-storage'
import { setDefaultMap } from '@mapa-mexico/postgres'

/**
 * Pasa este mapa a servir la raíz del dominio.
 *
 * Mueve las dos cosas que tienen que moverse juntas: la marca en la base y los
 * enlaces de la raíz. Si solo cambiara la base, el sitio seguiría entregando el
 * mapa anterior y nadie lo notaría hasta abrir la portada — un estado
 * inconsistente que no avisa.
 *
 * No mueve archivos: son dos renames, no casi un giga.
 */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const map = await currentMap(event)

  if (!(await setDefaultMap(database(), map.id))) {
    throw createError({ statusCode: 404, statusMessage: 'Ese mapa ya no existe.' })
  }

  const links = await pointRootAt(useRuntimeConfig().siteRoot, map.slug)
  return { ok: true, links }
})
