import { removeFile } from '@mapa-mexico/postgres'

/**
 * Unlinks a file from its medium. The bytes stay on disk.
 *
 * This is the deliberate opposite of what the old editor did, which was to
 * delete every unreferenced file under `contenidos/` on every save. Removing a
 * row here is reversible until someone runs the sweep and says so.
 */
export default defineEventHandler(async (event) => {
  requireUser(event)

  const mediumId = getRouterParam(event, 'id')!
  const fileId = getRouterParam(event, 'fileId')!

  const path = await removeFile(database(), mediumId, fileId)
  if (!path) throw createError({ statusCode: 404, statusMessage: 'Ese archivo no existe.' })

  return { ok: true, orphanedPath: path }
})
