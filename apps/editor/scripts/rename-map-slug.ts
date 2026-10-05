/**
 * Cambia la ruta pública de un mapa.
 *
 *   npm run rename-slug -- --from redmexico --to mapa2
 *
 * El slug no se edita desde el editor a propósito: es la URL que la gente
 * comparte, y cambiarla rompe los enlaces que ya circulan. Por eso es una
 * operación aparte, deliberada y de consola.
 *
 * Mueve tres cosas que tienen que moverse juntas: el directorio del mapa, la
 * fila de la base y, si es el mapa de la raíz, los enlaces simbólicos. Si
 * cualquiera falla, devuelve el directorio a su nombre y no toca la base.
 *
 * Lo que NO cambia son las rutas de los archivos: están guardadas relativas al
 * árbol del mapa (`contenidos/<mediumId>/…`), así que el slug no aparece en
 * ellas. Tampoco las publicaciones del historial, por lo mismo.
 */
import { rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { argv, env, exit } from 'node:process'

import pg from 'pg'
import { pointRootAt } from '@mapa-mexico/file-storage'
import { RESERVED_SLUGS, SLUG_SHAPE, getMapBySlug } from '@mapa-mexico/postgres'

function flag(name: string): string | undefined {
  const at = argv.indexOf(`--${name}`)
  return at === -1 ? undefined : argv[at + 1]
}

const from = flag('from')
const to = flag('to')
const siteRoot = resolve(flag('site') ?? env['NUXT_SITE_ROOT'] ?? '../../sitio')
const databaseUrl = env['NUXT_DATABASE_URL'] ?? env['DATABASE_URL']

if (!from || !to) {
  console.error('Uso: npm run rename-slug -- --from <slug> --to <slug>')
  exit(1)
}
if (!databaseUrl) {
  console.error('Falta NUXT_DATABASE_URL (o DATABASE_URL) en el entorno.')
  exit(1)
}
if (!SLUG_SHAPE.test(to)) {
  console.error('La ruta solo admite minúsculas, números y guiones.')
  exit(1)
}
if (RESERVED_SLUGS.has(to)) {
  console.error(`La ruta "${to}" está reservada: taparía el editor o la multimedia.`)
  exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })

try {
  const map = await getMapBySlug(pool, from)
  if (!map) {
    console.error(`No existe el mapa "${from}".`)
    exit(1)
  }
  if (await getMapBySlug(pool, to)) {
    console.error(`Ya existe un mapa en /${to}.`)
    exit(1)
  }

  const antes = join(siteRoot, from)
  const despues = join(siteRoot, to)

  // Primero el directorio: si falla, la base queda intacta y no hay nada que
  // deshacer. Al revés habría que revertir una transacción ya confirmada.
  await rename(antes, despues)

  try {
    await pool.query('update maps set slug = $2 where id = $1', [map.id, to])
  } catch (error) {
    await rename(despues, antes)
    throw error
  }

  console.log(`\n/${from} -> /${to}`)
  console.log(`  directorio  ${antes} -> ${despues}`)
  console.log('  base        actualizada')

  if (map.is_default) {
    for (const link of await pointRootAt(siteRoot, to)) {
      console.log(`  ${link.name.padEnd(11)} ${link.changed ? 'repuntado' : 'ya apuntaba bien'}`)
    }
  }
  console.log()
} finally {
  await pool.end()
}
