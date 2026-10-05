import { updateMedium } from '@mapa-mexico/postgres'

export default defineEventHandler(async (event) => {
  requireUser(event)
  const id = getRouterParam(event, 'id')!
  const map = await currentMap(event)
  const input = await readMediumInput(event)

  const updated = await updateMedium(database(), map.id, id, input)
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Ese medio no existe.' })

  return { ok: true }
})
