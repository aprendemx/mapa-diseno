import {
  IncompleteUploadError,
  completePartial,
  kindOf,
  removeStored,
} from '@mapa-mexico/file-storage'
import { addFile } from '@mapa-mexico/postgres'

/**
 * Cierra la subida: pone el archivo en su lugar y le da su fila.
 *
 *   POST /api/maps/<slug>/media/<id>/uploads/<uploadId>/finish?filename=x.mp4&bytes=18400000
 *   -> 201 { file }
 *
 * `bytes` es el tamaño que se declaró al abrir la subida, y acá se comprueba
 * contra lo que hay en disco. Sin esa comparación, una subida a la que le falta
 * el último trozo se completaría igual: el archivo existiría, tendría su fila,
 * y el mapa publicaría un video truncado que el navegador corta a mitad sin un
 * error en ninguna parte. Es la misma clase de falla que publicar validaba
 * tarde en el generador anterior.
 *
 * Si falta algo devuelve `409` con cuántos bytes hay, que es exactamente lo que
 * el cliente necesita para seguir subiendo en lugar de volver a empezar.
 */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const target = await uploadTarget(event)

  const bytes = Number(getQuery(event)['bytes'])
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Falta el tamaño del archivo.' })
  }

  let written
  try {
    written = await serialized(uploadKey(target), () =>
      completePartial(target.root, target.storedPath, bytes),
    )
  } catch (error) {
    if (error instanceof IncompleteUploadError) {
      throw createError({
        statusCode: 409,
        statusMessage: `La subida tiene ${error.received} de ${error.expected} bytes.`,
        data: { received: error.received, expected: error.expected },
      })
    }
    throw error
  }

  try {
    const record = await addFile(database(), {
      id: target.uploadId,
      mapId: target.map.id,
      mediumId: target.mediumId,
      kind: kindOf(target.filename),
      path: written.path,
    })
    setResponseStatus(event, 201)
    return { file: { ...record, bytes: written.bytes } }
  } catch (error) {
    // La fila es lo que hace encontrable a los bytes. Sin ella el archivo es un
    // huérfano desde que nace, así que se va ahora en lugar de esperar al
    // barrido. Igual que en la subida de una sola petición.
    await removeStored(target.root, written.path).catch(() => {})
    throw error
  }
})
