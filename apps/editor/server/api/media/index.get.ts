import { listMedia } from '@mapa-mexico/postgres'

export default defineEventHandler(async (event) => {
  requireUser(event)
  return { media: await listMedia(database()) }
})
