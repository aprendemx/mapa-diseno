import { getAppearance } from '@mapa-mexico/postgres'

export default defineEventHandler(async (event) => {
  requireUser(event)
  const map = await currentMap(event)
  return { appearance: await getAppearance(database(), map.id) }
})
