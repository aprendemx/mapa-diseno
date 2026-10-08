import { isAllowedExtension } from '@mapa-mexico/file-storage'
import { getMedium } from '@mapa-mexico/postgres'

/**
 * Abre una subida por trozos.
 *
 *   POST /api/maps/<slug>/media/<id>/uploads?filename=testigo.mp4&bytes=18400000
 *   -> { uploadId, chunkBytes, received: 0 }
 *
 * Esta petición no lleva bytes, y ahí está todo su valor: **todo lo que se
 * puede rechazar, se rechaza acá**, antes de que el navegador gaste un solo
 * kilobyte de subida. Antes el `.exe` y el archivo demasiado grande se
 * descubrían *durante* la transferencia, así que alguien podía esperar diez
 * minutos para recibir un 415.
 *
 * El `uploadId` que devuelve es el id definitivo del archivo. No hace falta
 * traducir nada después: la ruta en disco sale de él y del nombre, y la fila se
 * inserta con el mismo id al completar.
 */
export default defineEventHandler(async (event) => {
  requireUser(event)

  const query = getQuery(event)
  const filename = (query['filename'] as string | undefined)?.trim()
  const bytes = Number(query['bytes'])

  if (!filename) {
    throw createError({ statusCode: 400, statusMessage: 'Falta el nombre del archivo.' })
  }
  if (!isAllowedExtension(filename)) {
    throw createError({ statusCode: 415, statusMessage: 'Ese tipo de archivo no se admite.' })
  }
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Falta el tamaño del archivo.' })
  }

  const maximum = maxUploadBytes()
  if (bytes > maximum) {
    throw createError({
      statusCode: 413,
      statusMessage: `El archivo supera el límite de ${maximum} bytes.`,
      data: { maxUploadBytes: maximum },
    })
  }

  const mediumId = getRouterParam(event, 'id')!
  const map = await currentMap(event)
  if (!(await getMedium(database(), map.id, mediumId))) {
    throw createError({ statusCode: 404, statusMessage: 'Ese medio no existe.' })
  }

  setResponseStatus(event, 201)
  return { uploadId: newFileId(), chunkBytes: uploadChunkBytes(), received: 0 }
})
