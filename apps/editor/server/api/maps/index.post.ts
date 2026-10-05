import { APPEARANCE_DEFAULTS } from '@mapa-mexico/map-generator'
import { RESERVED_SLUGS, SLUG_SHAPE, createMap, getMapBySlug, listMaps } from '@mapa-mexico/postgres'

/**
 * Crea un mapa vacío con la apariencia por omisión.
 *
 * El slug se valida acá para dar un mensaje legible; el esquema lo valida otra
 * vez porque la consecuencia de uno reservado es que el editor deje de ser
 * alcanzable, y eso no puede depender de que esta capa se ejecute.
 */
export default defineEventHandler(async (event) => {
  requireUser(event)

  const body = await readBody<{ slug?: unknown, name?: unknown }>(event)
  const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const name = typeof body?.name === 'string' ? body.name.trim() : ''

  if (!name) {
    throw createError({ statusCode: 422, statusMessage: 'El mapa necesita un nombre.' })
  }
  if (!SLUG_SHAPE.test(slug)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'La ruta solo admite minúsculas, números y guiones: por ejemplo telesecundarias.',
    })
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw createError({ statusCode: 422, statusMessage: `La ruta "${slug}" está reservada.` })
  }

  const db = database()
  if (await getMapBySlug(db, slug)) {
    throw createError({ statusCode: 409, statusMessage: `Ya existe un mapa en /${slug}.` })
  }

  // El primero queda sirviendo la raíz: un sistema con mapas pero sin ninguno
  // predeterminado no entrega nada en `/`.
  const isDefault = (await listMaps(db)).length === 0

  const map = await createMap(db, { slug, name, appearance: APPEARANCE_DEFAULTS, isDefault })
  setResponseStatus(event, 201)
  return { map }
})
