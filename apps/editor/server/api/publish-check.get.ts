/** Says what is wrong, without touching anything. */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const problems = await inspect(database())
  return { ok: problems.length === 0, problems }
})
