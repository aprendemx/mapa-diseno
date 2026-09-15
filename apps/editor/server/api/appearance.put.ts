import type { Appearance } from '@mapa-mexico/map-generator'
import { validateAppearance } from '@mapa-mexico/project-store'
import { updateAppearance } from '@mapa-mexico/postgres'

export default defineEventHandler(async (event) => {
  requireUser(event)
  const appearance = await readBody<Appearance>(event)

  const problems = validateAppearance(appearance)
  if (problems.length > 0) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Hay valores fuera de rango.',
      data: { problems },
    })
  }

  await updateAppearance(database(), appearance)
  return { ok: true }
})
