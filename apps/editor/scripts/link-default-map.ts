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
import { resolve } from 'node:path'
import { env, exit } from 'node:process'

import pg from 'pg'
import { pointRootAt } from '@mapa-mexico/file-storage'
import { getDefaultMap } from '@mapa-mexico/postgres'

const siteRoot = resolve(env['NUXT_SITE_ROOT'] ?? '../../sitio')
const databaseUrl = env['NUXT_DATABASE_URL'] ?? env['DATABASE_URL']

if (!databaseUrl) {
  console.error('Falta NUXT_DATABASE_URL (o DATABASE_URL) en el entorno.')
  exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })

try {
  const map = await getDefaultMap(pool)
  if (!map) {
    console.error('No hay ningún mapa marcado como predeterminado.')
    exit(1)
  }

  console.log(`\nRaíz del sitio -> /${map.slug} (${map.name})`)
  for (const link of await pointRootAt(siteRoot, map.slug)) {
    console.log(`  ${link.name.padEnd(11)} ${link.changed ? 'enlazado' : 'ya apuntaba bien'}`)
  }
  console.log()
} finally {
  await pool.end()
}
