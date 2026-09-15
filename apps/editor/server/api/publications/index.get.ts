import { listPublications } from '@mapa-mexico/postgres'

export default defineEventHandler(async (event) => {
  requireUser(event)
  return { publications: await listPublications(database()) }
})
