import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'

import { UnsafePathError, resolveInRoot } from '@mapa-mexico/file-storage'

/**
 * Sirve multimedia de un mapa para previsualizarla en el editor.
 *
 * Podría apuntarse al sitio público, que sirve los mismos bytes — pero la URL
 * sería distinta en desarrollo y en producción, y distinta además para el mapa
 * de la raíz que para los demás. Tres formas de que el preview funcione en un
 * caso y no en otro.
 *
 * Por acá es una sola URL en todos los casos, acotada al mapa de la ruta y
 * detrás de la sesión. Cuesta que los bytes pasen por Node, que para tres
 * personas previsualizando de a un video es gratis.
 */
const TIPOS: Record<string, string> = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.m4v': 'video/mp4', '.mpeg': 'video/mpeg', '.mpg': 'video/mpeg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
}

export default defineEventHandler(async (event) => {
  requireUser(event)
  const map = await currentMap(event)

  const relative = (getRouterParam(event, 'path') ?? '').split('/').map(decodeURIComponent).join('/')

  let file: string
  try {
    // `resolveInRoot` rechaza cualquier cosa que se salga del árbol del mapa.
    // La ruta viene de la URL, así que es entrada de la calle.
    file = resolveInRoot(mapRoot(map), relative)
  } catch (error) {
    if (error instanceof UnsafePathError) {
      throw createError({ statusCode: 400, statusMessage: 'Ruta no permitida.' })
    }
    throw error
  }

  let info
  try {
    info = await stat(file)
    if (!info.isFile()) throw new Error('no es un archivo')
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Ese archivo no está en disco.' })
  }

  const type = TIPOS[extname(file).toLowerCase()] ?? 'application/octet-stream'
  setResponseHeader(event, 'Accept-Ranges', 'bytes')
  setResponseHeader(event, 'Content-Type', type)

  // Sin Range no hay seek: el navegador tendría que descargar el video entero
  // para saltar al final.
  const range = /^bytes=(\d*)-(\d*)$/.exec(getRequestHeader(event, 'range') ?? '')
  if (range) {
    const [, desde, hasta] = range
    const start = desde ? Number(desde) : info.size - Number(hasta)
    const end = hasta && desde ? Math.min(Number(hasta), info.size - 1) : info.size - 1

    if (start < 0 || start >= info.size || end < start) {
      setResponseHeader(event, 'Content-Range', `bytes */${info.size}`)
      setResponseStatus(event, 416)
      return ''
    }

    setResponseStatus(event, 206)
    setResponseHeader(event, 'Content-Range', `bytes ${start}-${end}/${info.size}`)
    setResponseHeader(event, 'Content-Length', end - start + 1)
    return sendStream(event, createReadStream(file, { start, end }))
  }

  setResponseHeader(event, 'Content-Length', info.size)
  return sendStream(event, createReadStream(file))
})
