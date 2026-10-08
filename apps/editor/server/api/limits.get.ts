import { ALLOWED_EXTENSIONS } from '@mapa-mexico/file-storage'

/**
 * Lo que el servidor acepta de una subida.
 *
 * Existe para que el editor pueda decir la verdad antes de empezar. El tope y
 * las extensiones los decide el servidor —y los sigue aplicando él, esto no es
 * una comprobación de seguridad— pero mientras el navegador no los conozca, la
 * interfaz no tiene más opción que aceptar cualquier archivo y descubrir el
 * problema a mitad de la transferencia. Eso ya pasó: la gente esperaba minutos
 * para recibir un número de error sin explicación.
 */
export default defineEventHandler((event) => {
  requireUser(event)
  return {
    maxUploadBytes: maxUploadBytes(),
    chunkBytes: uploadChunkBytes(),
    extensions: [...ALLOWED_EXTENSIONS].sort(),
  }
})
