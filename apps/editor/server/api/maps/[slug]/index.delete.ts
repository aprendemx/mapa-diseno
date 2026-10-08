import { deleteMap, listMaps } from '@mapa-mexico/postgres'

/**
 * Borra el mapa con su catálogo, su apariencia y su historial.
 *
 * Los bytes en disco quedan: `sitio/<slug>/` sigue ahí. Borrar un registro no
 * puede ser lo que destruye la única copia de la multimedia de alguien.
 */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const map = await currentMap(event)

  if (map.is_default) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Es el mapa de la raíz. Pasa otro a la raíz antes de borrarlo.',
    })
  }
  if ((await listMaps(database())).length <= 1) {
    throw createError({ statusCode: 409, statusMessage: 'Es el único mapa que queda.' })
  }

  await deleteMap(database(), map.id)
  return { ok: true, remainingFiles: `sitio/${map.slug}/` }
})
