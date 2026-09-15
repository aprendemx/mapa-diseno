import { listStates } from '@mapa-mexico/postgres'

export default defineEventHandler(async (event) => {
  requireUser(event)
  return { states: await listStates(database()) }
})
