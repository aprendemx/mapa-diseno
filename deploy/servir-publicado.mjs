/**
 * Sirve el mapa publicado en local, igual que lo hace nginx en produccion.
 *
 *   node deploy/servir-publicado.mjs [puerto]
 *
 * Existe porque la pagina publicada referencia `contenidos/` relativo a si
 * misma. En produccion nginx monta la multimedia dentro de su raiz; abriendo
 * el archivo directamente no hay nada ahi y el mapa carga sin un solo video.
 *
 * Soporta peticiones Range, que es lo que necesita el seek de los videos.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const RAIZ = resolve(import.meta.dirname, '..')
const PUBLICADO = join(RAIZ, 'publicado')
const CONTENIDOS = join(RAIZ, 'contenidos')
const PUERTO = Number(process.argv[2] ?? 8080)

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.avif': 'image/avif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.m4v': 'video/mp4', '.mpeg': 'video/mpeg', '.mpg': 'video/mpeg', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.flac': 'audio/flac',
}

function resolver(url) {
  const ruta = normalize(decodeURIComponent(url.split('?')[0]))
  if (ruta.includes('..')) return undefined

  if (ruta === '/' || ruta === '/index.html') return join(PUBLICADO, 'index.html')
  if (ruta.startsWith('/contenidos/')) return join(CONTENIDOS, ruta.slice('/contenidos/'.length))
  return join(PUBLICADO, ruta)
}

createServer(async (peticion, respuesta) => {
  const archivo = resolver(peticion.url ?? '/')
  if (!archivo) return respuesta.writeHead(400).end('Ruta no permitida')

  let info
  try {
    info = await stat(archivo)
    if (!info.isFile()) throw new Error('no es un archivo')
  } catch {
    return respuesta.writeHead(404).end('No encontrado')
  }

  const tipo = TIPOS[extname(archivo).toLowerCase()] ?? 'application/octet-stream'
  const rango = /^bytes=(\d*)-(\d*)$/.exec(peticion.headers.range ?? '')

  if (rango) {
    const inicio = rango[1] ? Number(rango[1]) : info.size - Number(rango[2])
    const fin = rango[2] && rango[1] ? Math.min(Number(rango[2]), info.size - 1) : info.size - 1

    if (inicio < 0 || inicio >= info.size || fin < inicio) {
      return respuesta.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end()
    }
    respuesta.writeHead(206, {
      'Content-Type': tipo,
      'Content-Range': `bytes ${inicio}-${fin}/${info.size}`,
      'Content-Length': fin - inicio + 1,
      'Accept-Ranges': 'bytes',
    })
    return createReadStream(archivo, { start: inicio, end: fin }).pipe(respuesta)
  }

  respuesta.writeHead(200, {
    'Content-Type': tipo,
    'Content-Length': info.size,
    'Accept-Ranges': 'bytes',
  })
  createReadStream(archivo).pipe(respuesta)
}).listen(PUERTO, '127.0.0.1', () => {
  console.log(`\nMapa publicado en http://localhost:${PUERTO}\n`)
})
