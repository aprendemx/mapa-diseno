/**
 * Sirve el arbol de mapas en local, igual que nginx en produccion.
 *
 *   node deploy/servir-publicado.mjs [puerto]
 *
 *   /              -> sitio/index.html   (enlace al mapa predeterminado)
 *   /contenidos/…  -> sitio/contenidos   (idem)
 *   /<slug>/…      -> sitio/<slug>/…
 *
 * Una sola raiz y nada por mapa: la pagina referencia `contenidos/` relativo a
 * si misma, asi que cada mapa en su directorio resuelve solo. Abriendo el
 * archivo directamente no hay nada que servir la multimedia y el mapa carga sin
 * un solo video, que parece un fallo del generador y no lo es.
 *
 * Soporta peticiones Range, que es lo que necesita el seek de los videos.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const SITIO = resolve(import.meta.dirname, '..', 'sitio')
const PUERTO = Number(process.argv[2] ?? 8080)

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.avif': 'image/avif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.m4v': 'video/mp4', '.mpeg': 'video/mpeg', '.mpg': 'video/mpeg', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.flac': 'audio/flac',
}

/**
 * Las mismas dos candidatas que prueba nginx con `try_files $uri $uri/index.html`.
 *
 * Sin la segunda, /telesecundarias da 404 aunque la pagina este publicada: el
 * directorio existe pero no es un archivo. nginx lo resolveria y este servidor
 * no, que es la clase de diferencia entre desarrollo y produccion que hace
 * perder una tarde buscando un bug que no existe.
 */
function candidatas(url) {
  const ruta = normalize(decodeURIComponent(url.split('?')[0]))
  if (ruta.includes('..')) return []

  if (ruta === '/') return [join(SITIO, 'index.html')]
  return [join(SITIO, ruta), join(SITIO, ruta, 'index.html')]
}

createServer(async (peticion, respuesta) => {
  const posibles = candidatas(peticion.url ?? '/')
  if (posibles.length === 0) return respuesta.writeHead(400).end('Ruta no permitida')

  let archivo
  let info
  for (const posible of posibles) {
    try {
      const encontrado = await stat(posible)
      if (encontrado.isFile()) { archivo = posible; info = encontrado; break }
    } catch { /* probar la siguiente */ }
  }
  if (!archivo || !info) return respuesta.writeHead(404).end('No encontrado')

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
  console.log(`\nSitio en http://localhost:${PUERTO}\n`)
})
