export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const id = getRouterParam(event, 'id')!

  const map = await currentMap(event)
  const result = await restorePublication(database(), map, user, id)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Esa publicación no existe.' })

  return { publication: result.publication, bytes: result.bytes }
})
