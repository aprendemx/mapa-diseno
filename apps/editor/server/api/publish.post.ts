export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const result = await publishCatalogue(database(), user)

  if (!result.ok) {
    throw createError({
      statusCode: 422,
      statusMessage: 'El catálogo no está listo para publicarse.',
      data: { problems: result.problems },
    })
  }

  return { publication: result.publication, bytes: result.bytes }
})
