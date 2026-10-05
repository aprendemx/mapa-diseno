export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const id = getRouterParam(event, 'id')!

  const map = await currentMap(event)
  const result = await restorePublication(database(), map, user, id)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Esa publicación no existe.' })

  if (!result.ok) {
    throw createError({
      statusCode: 422,
      statusMessage:
        'Esa versión referencia archivos que ya no están en disco. No se publicó nada.',
      data: { problems: result.problems },
    })
  }

  return { publication: result.publication, bytes: result.bytes }
})
