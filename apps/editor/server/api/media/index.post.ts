import { createMedium } from '@mapa-mexico/postgres'

export default defineEventHandler(async (event) => {
  requireUser(event)
  const map = await currentMap(event)
  const input = await readMediumInput(event)
  const id = await createMedium(database(), map.id, input)

  setResponseStatus(event, 201)
  return { id }
})
