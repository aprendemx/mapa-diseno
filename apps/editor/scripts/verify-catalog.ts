/**
 * Regenera el mapa desde la base y resume lo que contiene.
 *
 *   npm run verify-catalog -- --map redmexico
 */
import { argv, env, exit } from 'node:process'

import pg from 'pg'
import { generateMapData } from '@mapa-mexico/map-generator'
import { fromRows } from '@mapa-mexico/project-store'
import { getMapBySlug, readCatalog } from '@mapa-mexico/postgres'

function flag(name: string): string | undefined {
  const at = argv.indexOf(`--${name}`)
  return at === -1 ? undefined : argv[at + 1]
}

const slug = flag('map') ?? 'redmexico'
const databaseUrl = env['NUXT_DATABASE_URL'] ?? env['DATABASE_URL']
if (!databaseUrl) {
  console.error('Falta NUXT_DATABASE_URL (o DATABASE_URL) en el entorno.')
  exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })
try {
  const map = await getMapBySlug(pool, slug)
  if (!map) {
    console.error(`No existe el mapa "${slug}".`)
    exit(1)
  }

  const data = generateMapData(fromRows(await readCatalog(pool, map.id)))
  console.log(
    `/${map.slug} | medios ${data.media.length} | estados activos ` +
    `${data.states.filter((s) => s.active === '1').length}/${data.states.length} | ` +
    `notas ${data.campaigns.length} | testigos ${data.contents.length}`,
  )
} finally {
  await pool.end()
}
