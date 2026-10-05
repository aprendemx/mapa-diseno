import { setDefaultMap } from '@mapa-mexico/postgres'

/**
 * Pasa este mapa a servir la raíz del dominio.
 *
 * No mueve archivos: la raíz son dos enlaces simbólicos al directorio del mapa
 * predeterminado, y repuntarlos es trabajo del publicador.
 */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const map = await currentMap(event)

  if (!(await setDefaultMap(database(), map.id))) {
    throw createError({ statusCode: 404, statusMessage: 'Ese mapa ya no existe.' })
  }
  return { ok: true }
})
