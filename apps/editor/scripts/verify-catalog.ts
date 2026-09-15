/** Regenerates the map from the database and prints what it contains. */
import { env, exit } from 'node:process'

import pg from 'pg'
import { generateMapData } from '@mapa-mexico/map-generator'
import { fromRows } from '@mapa-mexico/project-store'
import { readCatalog } from '@mapa-mexico/postgres'

const databaseUrl = env['NUXT_DATABASE_URL'] ?? env['DATABASE_URL']
if (!databaseUrl) {
  console.error('Falta NUXT_DATABASE_URL (o DATABASE_URL) en el entorno.')
  exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })
try {
  const data = generateMapData(fromRows(await readCatalog(pool)))
  console.log(
    `medios ${data.media.length} | estados activos ` +
    `${data.states.filter((s) => s.active === '1').length}/${data.states.length} | ` +
    `notas ${data.campaigns.length} | testigos ${data.contents.length}`,
  )
} finally {
  await pool.end()
}
