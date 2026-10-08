import {
  FileTooLargeError,
  OffsetMismatchError,
  appendChunk,
  discardPartial,
} from '@mapa-mexico/file-storage'

/**
 * Agrega un trozo a una subida en curso.
 *
 *   PATCH /api/maps/<slug>/media/<id>/uploads/<uploadId>?filename=x.mp4&offset=8388608
 *   body: los bytes crudos del trozo
 *   -> { received }
 *
 * Cuerpo crudo y no multipart, igual que la subida de una sola petición: el
 * trozo va del `Blob` del navegador al disco sin un parser en el medio y sin
 * acumularse en ninguna parte.
 *
 * El `409` es la pieza que hace que esto sea robusto en lugar de frágil. Lleva
 * los bytes que el servidor tiene de verdad, así que un cliente que perdió la
 * cuenta —porque reintentó, porque una respuesta se perdió en el camino, porque
 * un trozo entró a medias— no tiene que adivinar: se corrige con el número que
 * le devuelven y sigue. Aceptar el trozo igual sería duplicar bytes, y el
 * resultado es un video corrupto que en un listado de directorio se ve
 * perfectamente normal.
 */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const target = await uploadTarget(event)

  const offset = Number(getQuery(event)['offset'])
  if (!Number.isInteger(offset) || offset < 0) {
    throw createError({ statusCode: 400, statusMessage: 'Falta el desplazamiento del trozo.' })
  }

  try {
    const { received } = await serialized(uploadKey(target), () =>
      appendChunk(target.root, target.storedPath, offset, event.node.req, {
        maxBytes: maxUploadBytes(),
      }),
    )
    return { received }
  } catch (error) {
    if (error instanceof OffsetMismatchError) {
      throw createError({
        statusCode: 409,
        statusMessage: `La subida tiene ${error.received} bytes. Continúa desde ahí.`,
        data: { received: error.received },
      })
    }
    if (error instanceof FileTooLargeError) {
      // Esta subida ya no puede completarse nunca, así que los bytes se van
      // ahora en lugar de esperar noventa días al barrido ocupando disco.
      await discardPartial(target.root, target.storedPath).catch(() => {})
      throw createError({ statusCode: 413, statusMessage: error.message })
    }
    throw error
  }
})
