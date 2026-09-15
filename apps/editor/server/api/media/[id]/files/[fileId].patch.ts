import { updateFileDescription } from '@mapa-mexico/postgres'

export default defineEventHandler(async (event) => {
  requireUser(event)

  const mediumId = getRouterParam(event, 'id')!
  const fileId = getRouterParam(event, 'fileId')!
  const body = await readBody<{ description?: unknown }>(event)
  const description = typeof body?.description === 'string' ? body.description : ''

  if (description.length > 500) {
    throw createError({ statusCode: 422, statusMessage: 'La descripción es demasiado larga.' })
  }

  const updated = await updateFileDescription(database(), mediumId, fileId, description)
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Ese archivo no existe.' })

  return { ok: true }
})
