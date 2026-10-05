import { listMaps } from '@mapa-mexico/postgres'

export default defineEventHandler(async (event) => {
  requireUser(event)
  return { maps: await listMaps(database()) }
})
