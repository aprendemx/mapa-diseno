/**
 * Imports the legacy `datos/proyecto.json` into the database.
 *
 *   npm run import-legacy -- --file ../../datos/proyecto.json
 *
 * Replaces the whole catalogue in one transaction: it is the migration path
 * and the restore path, not something to run on a live catalogue by accident.
 * Anything already there is deleted, so it refuses to run unless --force is
 * passed and the catalogue is non-empty.
 */
import { readFileSync } from 'node:fs'
import { argv, env, exit } from 'node:process'

import pg from 'pg'
import type { Project } from '@mapa-mexico/map-generator'
import { generateMapData } from '@mapa-mexico/map-generator'
import { fromRows, toRows } from '@mapa-mexico/project-store'
import { readCatalog, replaceCatalog } from '@mapa-mexico/postgres'

function flag(name: string): string | undefined {
  const at = argv.indexOf(`--${name}`)
  return at === -1 ? undefined : argv[at + 1]
}

const file = flag('file') ?? '../../datos/proyecto.json'
const databaseUrl = env['NUXT_DATABASE_URL'] ?? env['DATABASE_URL']

if (!databaseUrl) {
  console.error('Falta NUXT_DATABASE_URL (o DATABASE_URL) en el entorno.')
  exit(1)
}

const project = JSON.parse(readFileSync(file, 'utf8')) as Project
const rows = toRows(project)

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })

try {
  const existing = await pool.query('select count(*)::int as n from media')
  const current = (existing.rows[0] as { n: number }).n

  if (current > 0 && !argv.includes('--force')) {
    console.error(
      `El catálogo ya tiene ${current} medio(s). Volvé a correr con --force para reemplazarlo.`,
    )
    exit(1)
  }

  await replaceCatalog(pool, rows)

  // Read it back and regenerate, rather than trusting the write. If the import
  // lost something, this is where it shows — before anyone edits on top of it.
  const stored = await readCatalog(pool)
  const generated = generateMapData(fromRows(stored))

  const legacyPaths = stored.files.filter((row) => !/^contenidos\/[^/]+\/archivo-/.test(row.path))

  console.log(`\nCatálogo importado desde ${file}`)
  console.log(`  medios     ${generated.media.length}`)
  console.log(`  estados    ${generated.states.length} (${generated.states.filter((s) => s.active === '1').length} activos)`)
  console.log(`  notas      ${generated.campaigns.length}`)
  console.log(`  testigos   ${generated.contents.length}`)

  // El documento legacy trae rutas derivadas del nombre del medio. Los
  // archivos en disco ya usan el esquema por id, así que un import deja la
  // base apuntando a rutas que no resuelven y publicar falla — con razón, pero
  // sin decir que la causa fue este comando.
  if (legacyPaths.length > 0) {
    console.log(`\n  AVISO: ${legacyPaths.length} ruta(s) quedaron con el esquema legacy.`)
    console.log('  Corré ahora:  npm run migrate-paths -- --apply')
  }
  console.log()
} finally {
  await pool.end()
}
