/** Says what is wrong, without touching anything. */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const map = await currentMap(event)
  const problems = await inspect(database(), map)
  return { ok: problems.length === 0, problems }
})
