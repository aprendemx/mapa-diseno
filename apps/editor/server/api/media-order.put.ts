import { reorderMedia } from '@mapa-mexico/postgres'

/**
 * Deliberately not `/api/media/order`.
 *
 * That path collides with `/api/media/:id`: a medium named "Order" slugs to
 * `order`, and its detail route would be shadowed by this one forever. The
 * type checker caught it before any data did.
 */

export default defineEventHandler(async (event) => {
  requireUser(event)
  const body = await readBody<{ ids?: unknown }>(event)

  if (!Array.isArray(body?.ids) || body.ids.some((id) => typeof id !== 'string')) {
    throw createError({ statusCode: 400, statusMessage: 'Se esperaba una lista de identificadores.' })
  }

  await reorderMedia(database(), body.ids as string[])
  return { ok: true }
})
