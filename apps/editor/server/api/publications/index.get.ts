import { listPublications } from '@mapa-mexico/postgres'

export default defineEventHandler(async (event) => {
  requireUser(event)
  const map = await currentMap(event)
  return { publications: await listPublications(database(), map.id) }
})
