import { createMedium } from '@mapa-mexico/postgres'

export default defineEventHandler(async (event) => {
  requireUser(event)
  const input = await readMediumInput(event)
  const id = await createMedium(database(), input)

  setResponseStatus(event, 201)
  return { id }
})
