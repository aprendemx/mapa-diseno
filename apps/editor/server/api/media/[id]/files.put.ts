import {
  FileTooLargeError,
  isAllowedExtension,
  kindOf,
  removeStored,
  storagePath,
  writeStreamed,
} from '@mapa-mexico/file-storage'
import { addFile, getMedium } from '@mapa-mexico/postgres'

/**
 * Uploads one file.
 *
 *   PUT /api/media/<id>/files?filename=testigo.mp4
 *   body: the raw bytes
 *
 * Raw body rather than multipart, and one file per request. The browser can
 * hand `fetch` a `File` directly, so it streams the whole way with no parser
 * in the middle and no accumulation anywhere — which is the thing the old
 * base64-in-JSON upload could not do.
 */
export default defineEventHandler(async (event) => {
  requireUser(event)

  const mediumId = getRouterParam(event, 'id')!
  const filename = (getQuery(event)['filename'] as string | undefined)?.trim()

  if (!filename) {
    throw createError({ statusCode: 400, statusMessage: 'Falta el nombre del archivo.' })
  }
  if (!isAllowedExtension(filename)) {
    throw createError({
      statusCode: 415,
      statusMessage: 'Ese tipo de archivo no se admite.',
    })
  }

  const db = database()
  const map = await currentMap(event)
  if (!(await getMedium(db, map.id, mediumId))) {
    throw createError({ statusCode: 404, statusMessage: 'Ese medio no existe.' })
  }

  const fileId = newFileId()
  const path = storagePath(mediumId, fileId, filename)

  let written
  try {
    written = await writeStreamed(mapRoot(map), path, event.node.req, {
      maxBytes: maxUploadBytes(),
    })
  } catch (error) {
    if (error instanceof FileTooLargeError) {
      throw createError({ statusCode: 413, statusMessage: error.message })
    }
    throw error
  }

  try {
    const record = await addFile(db, {
      id: fileId, mapId: map.id, mediumId, kind: kindOf(filename), path,
    })
    setResponseStatus(event, 201)
    return { file: { ...record, bytes: written.bytes } }
  } catch (error) {
    // The row is what makes the bytes findable. Without it the file is an
    // orphan from birth, so it goes back out rather than waiting for a sweep.
    await removeStored(mapRoot(map), path).catch(() => {})
    throw error
  }
})
