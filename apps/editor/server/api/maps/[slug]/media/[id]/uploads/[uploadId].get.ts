import { receivedBytes } from '@mapa-mexico/file-storage'

/**
 * Cuántos bytes de esta subida tiene el servidor.
 *
 *   GET /api/maps/<slug>/media/<id>/uploads/<uploadId>?filename=testigo.mp4
 *   -> { received, chunkBytes }
 *
 * Esto es reanudar. El navegador que perdió la conexión —o la pestaña que se
 * cerró, o la máquina que se suspendió— pregunta y sigue desde ahí en lugar de
 * empezar de cero. La respuesta sale de `stat` sobre el `.parcial`, así que es
 * el disco el que contesta y no un contador que podría haber sobrevivido a un
 * corte con un valor que el disco no respalda.
 */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const target = await uploadTarget(event)

  return {
    uploadId: target.uploadId,
    received: await receivedBytes(target.root, target.storedPath),
    chunkBytes: uploadChunkBytes(),
  }
})
