import { deleteMedium } from '@mapa-mexico/postgres'

export default defineEventHandler(async (event) => {
  requireUser(event)
  const id = getRouterParam(event, 'id')!

  const map = await currentMap(event)

  const removed = await deleteMedium(database(), map.id, id)
  if (!removed) throw createError({ statusCode: 404, statusMessage: 'Ese medio no existe.' })

  // The record is gone; the files on disk are not. Unlinking a medium must
  // never be the thing that deletes someone's only copy of a video.
  return { ok: true }
})
