/**
 * Tope de una subida, en bytes.
 *
 * Falla cerrado ante un valor que no es un número. `Number('abc')` es `NaN`, y
 * toda comparación contra `NaN` es falsa: una variable de entorno mal escrita
 * dejaría el tope **sin efecto** en lugar de en cero, que es la dirección
 * equivocada para que falle un límite.
 */
export function maxUploadBytes(): number {
  const bytes = Number(useRuntimeConfig().maxUploadBytes)
  if (!Number.isFinite(bytes) || bytes <= 0) {
    throw createError({
      statusCode: 500,
      statusMessage: 'NUXT_MAX_UPLOAD_BYTES no es un número de bytes válido.',
    })
  }
  return bytes
}

/**
 * Tamaño del trozo que el cliente debe mandar por petición.
 *
 * Lo decide el servidor y no el navegador porque el límite que esquiva es del
 * camino de red, no del archivo: Traefik deja de leer un cuerpo a los 60
 * segundos por omisión y Cloudflare rechaza cualquiera de más de 100 MB. Con 4
 * MiB, un trozo tarda unos 34 segundos incluso a 1 Mbps de subida —así que la
 * aplicación funciona sin depender de que esa infraestructura esté bien
 * configurada, que es justamente lo que no está a su alcance.
 */
export function uploadChunkBytes(): number {
  const bytes = Number(useRuntimeConfig().uploadChunkBytes)
  if (!Number.isFinite(bytes) || bytes <= 0) {
    throw createError({
      statusCode: 500,
      statusMessage: 'NUXT_UPLOAD_CHUNK_BYTES no es un número de bytes válido.',
    })
  }
  return bytes
}

/** `archivo-<epoch>-<aleatorio>`, la forma que ya tienen los ids legacy. */
export function newFileId(): string {
  const random = Math.random().toString(36).slice(2, 7)
  return `archivo-${Date.now()}-${random}`
}

/**
 * Si una cadena tiene la forma de un id que este servidor emitió.
 *
 * Hace falta porque en una subida por trozos el id vuelve **desde el cliente**
 * en cada petición, y de él sale la ruta en disco. `resolveInRoot` ya impide
 * escapar de la raíz, pero esto corta antes y devuelve un 400 que se entiende
 * en lugar de un 500, y evita que alguien siembre nombres arbitrarios dentro
 * del árbol de multimedia.
 */
export function isFileId(value: string): boolean {
  return /^archivo-[0-9]+-[a-z0-9]+$/.test(value)
}
