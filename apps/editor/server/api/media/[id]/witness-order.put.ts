import { reorderWitnesses } from '@mapa-mexico/postgres'

export default defineEventHandler(async (event) => {
  requireUser(event)

  const mediumId = getRouterParam(event, 'id')!
  const body = await readBody<{ ids?: unknown }>(event)

  if (!Array.isArray(body?.ids) || body.ids.some((id) => typeof id !== 'string')) {
    throw createError({ statusCode: 400, statusMessage: 'Se esperaba una lista de identificadores.' })
  }

  const map = await currentMap(event)
  await reorderWitnesses(database(), map.id, mediumId, body.ids as string[])
  return { ok: true }
})
