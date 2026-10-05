import { getMedium } from '@mapa-mexico/postgres'

export default defineEventHandler(async (event) => {
  requireUser(event)
  const id = getRouterParam(event, 'id')!

  const map = await currentMap(event)

  const medium = await getMedium(database(), map.id, id)
  if (!medium) throw createError({ statusCode: 404, statusMessage: 'Ese medio no existe.' })

  return { medium }
})
