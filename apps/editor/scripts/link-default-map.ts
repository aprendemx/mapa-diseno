/**
 * Apunta la raiz del sitio al mapa predeterminado.
 *
 *   npm run link-default
 *
 * El sitio es un directorio por mapa. La raiz del dominio son dos enlaces
 * simbolicos al del mapa predeterminado:
 *
 *   sitio/index.html  -> <slug>/index.html
 *   sitio/contenidos  -> <slug>/contenidos
 *
 * Es asi y no copiando la pagina a la raiz porque la pagina referencia
 * `contenidos/...` relativo a si misma: con los enlaces, `/` y
 * `/contenidos/x.mp4` caen en el arbol del mapa sin reescribir una sola ruta
 * almacenada. Y cambiar cual es el predeterminado es repuntar dos enlaces en
 * lugar de mover casi un giga.
 */
import { lstat, mkdir, readlink, rm, symlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { env, exit } from 'node:process'

import pg from 'pg'
import { getDefaultMap } from '@mapa-mexico/postgres'

const siteRoot = resolve(env['NUXT_SITE_ROOT'] ?? '../../sitio')
const databaseUrl = env['NUXT_DATABASE_URL'] ?? env['DATABASE_URL']

if (!databaseUrl) {
  console.error('Falta NUXT_DATABASE_URL (o DATABASE_URL) en el entorno.')
  exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })

/** Reemplaza el enlace si apunta a otro lado; no toca un archivo real. */
async function point(nombre: string, destino: string): Promise<string> {
  const ruta = join(siteRoot, nombre)

  try {
    const info = await lstat(ruta)
    if (!info.isSymbolicLink()) {
      throw new Error(
        `${ruta} existe y no es un enlace simbólico. ` +
        'Moverlo o borrarlo a mano: este script no pisa archivos reales.',
      )
    }
    if (await readlink(ruta) === destino) return 'ya apuntaba bien'
    await rm(ruta)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  await symlink(destino, ruta)
  return 'enlazado'
}

try {
  const map = await getDefaultMap(pool)
  if (!map) {
    console.error('No hay ningún mapa marcado como predeterminado.')
    exit(1)
  }

  await mkdir(join(siteRoot, map.slug), { recursive: true })

  console.log(`\nRaíz del sitio -> /${map.slug} (${map.name})`)
  console.log(`  index.html  ${await point('index.html', `${map.slug}/index.html`)}`)
  console.log(`  contenidos  ${await point('contenidos', `${map.slug}/contenidos`)}\n`)
} finally {
  await pool.end()
}
