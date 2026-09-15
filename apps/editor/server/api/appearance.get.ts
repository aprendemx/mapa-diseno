import { getAppearance } from '@mapa-mexico/postgres'

export default defineEventHandler(async (event) => {
  requireUser(event)
  return { appearance: await getAppearance(database()) }
})
