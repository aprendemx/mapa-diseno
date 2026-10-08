/**
 * El mensaje que el servidor quiso dar, sacado del **cuerpo** de la respuesta.
 *
 * Existe porque la forma obvia no funciona. Un error de `$fetch` expone
 * `statusMessage`, y leerlo parece lo correcto, pero ofetch lo define como un
 * alias de `response.statusText` —la *reason phrase* de la línea de estado
 * HTTP— y no como el `statusMessage` que `createError` puso en el JSON. Son
 * dos cosas distintas, y la primera se rompe dos veces:
 *
 * - **La reason phrase es ASCII.** h3 la sanitiza, así que "Correo o contraseña
 *   incorrectos." llega como "Correo o contrasea incorrectos.". Toda tilde y
 *   toda ñ se pierden.
 * - **HTTP/2 no tiene reason phrase.** La eliminó del protocolo, así que detrás
 *   de Cloudflare `statusText` es `''`. Y `??` solo reemplaza `null` y
 *   `undefined`, no una cadena vacía: el mensaje quedaba en blanco y la
 *   pantalla no mostraba **nada**. En desarrollo no se veía, porque el servidor
 *   de Nuxt habla HTTP/1.1.
 *
 * O sea que fallaba justo en producción y justo cuando alguien necesitaba saber
 * qué pasó. El cuerpo JSON, en cambio, llega entero por las dos versiones del
 * protocolo: es de donde el resto de la aplicación ya leía sus `problems`.
 *
 * Usa `||` y no `??` a propósito, para que una cadena vacía también caiga al
 * valor por omisión.
 */
export function apiMessage(cause: unknown, fallback: string): string {
  const body = (cause as { data?: { statusMessage?: string, message?: string } })?.data
  return body?.statusMessage?.trim() || body?.message?.trim() || fallback
}
