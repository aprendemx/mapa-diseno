export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const id = getRouterParam(event, 'id')!

  const result = await restorePublication(database(), user, id)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Esa publicación no existe.' })

  return { publication: result.publication, bytes: result.bytes }
})
