import { renameMap } from '@mapa-mexico/postgres'

/**
 * Renombra el mapa. El slug no se toca.
 *
 * Cambiarlo movería la URL pública y rompería cualquier enlace ya compartido,
 * así que es una operación aparte y deliberada, no un efecto de editar el
 * nombre para mostrar.
 */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const map = await currentMap(event)

  const body = await readBody<{ name?: unknown }>(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) {
    throw createError({ statusCode: 422, statusMessage: 'El mapa necesita un nombre.' })
  }

  await renameMap(database(), map.id, name)
  return { ok: true }
})
