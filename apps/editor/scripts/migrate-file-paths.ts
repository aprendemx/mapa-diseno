/**
 * Moves stored media from the legacy name-derived layout to id-derived paths.
 *
 *   npm run migrate-paths              # informe, no toca nada
 *   npm run migrate-paths -- --apply   # mueve y actualiza la base
 *
 * Legacy layout: contenidos/<estado>/<slug del nombre>/<slug del archivo>.mp4
 * New layout:    contenidos/<mediumId>/<fileId>-<etiqueta>.mp4
 *
 * The point is that the new path derives only from identifiers that never
 * change, so renaming a medium — or moving it to another state — stops being
 * a disk operation.
 *
 * This is the one migration that alters what the published map contains: every
 * `contents[].file` changes. Nothing else may. The script proves that by
 * generating the map before and after and diffing the two.
 */
import { basename } from 'node:path'
import { argv, env, exit } from 'node:process'

import pg from 'pg'
import { generateMapData } from '@mapa-mexico/map-generator'
import type { MapData } from '@mapa-mexico/map-generator'
import { fromRows } from '@mapa-mexico/project-store'
import { readCatalog } from '@mapa-mexico/postgres'
import { moveStored, statStored, storagePath } from '@mapa-mexico/file-storage'

function flag(name: string): string | undefined {
  const at = argv.indexOf(`--${name}`)
  // Guard the -1: `argv[-1 + 1]` is the node binary, which silently becomes a
  // plausible-looking root and sends every stat somewhere absurd.
  return at === -1 ? undefined : argv[at + 1]
}

const apply = argv.includes('--apply')
const mediaRoot = flag('root') ?? '../..'
const databaseUrl = env['NUXT_DATABASE_URL'] ?? env['DATABASE_URL']

if (!databaseUrl) {
  console.error('Falta NUXT_DATABASE_URL (o DATABASE_URL) en el entorno.')
  exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })

/** Everything except `contents[].file`, so the diff can ignore the intended change. */
function withoutFilePaths(data: MapData): string {
  return JSON.stringify({
    ...data,
    contents: data.contents.map((content) =>
      'file' in content ? { ...content, file: '<ruta>' } : content,
    ),
  })
}

try {
  const before = generateMapData(fromRows(await readCatalog(pool)))

  const files = (
    await pool.query('select id, medium_id, path from media_files order by medium_id, witness_position')
  ).rows as { id: string, medium_id: string, path: string }[]

  const planned = files
    .map((file) => ({
      ...file,
      target: storagePath(file.medium_id, file.id, basename(file.path)),
    }))
    .filter((file) => file.target !== file.path)

  console.log(`\n${files.length} archivo(s) registrados, ${planned.length} por mover.`)

  // Nothing moves until every source is accounted for. A missing file is a
  // reason to stop and look, never to migrate around it.
  //
  // Except when it is already at its destination: a run interrupted between
  // moving the bytes and committing the rows leaves exactly that state, and it
  // must be resumable rather than a dead end.
  const missing: string[] = []
  const alreadyMoved = new Set<string>()

  for (const file of planned) {
    if (await statStored(mediaRoot, file.path)) continue
    if (await statStored(mediaRoot, file.target)) {
      alreadyMoved.add(file.id)
      continue
    }
    missing.push(file.path)
  }

  if (missing.length > 0) {
    console.error(`\nFaltan ${missing.length} archivo(s) en disco. No se movio nada:`)
    for (const path of missing.slice(0, 10)) console.error(`  ${path}`)
    exit(1)
  }
  if (alreadyMoved.size > 0) {
    console.log(`${alreadyMoved.size} ya estaban en su destino; solo se actualiza la base.`)
  }

  const collisions = new Map<string, number>()
  for (const file of planned) {
    collisions.set(file.target, (collisions.get(file.target) ?? 0) + 1)
  }
  const duplicated = [...collisions].filter(([, count]) => count > 1)
  if (duplicated.length > 0) {
    console.error('\nDos archivos caerian en la misma ruta. No se movio nada:')
    for (const [path] of duplicated.slice(0, 10)) console.error(`  ${path}`)
    exit(1)
  }

  if (!apply) {
    console.log('\nEjemplos (informe, no se movio nada):')
    for (const file of planned.slice(0, 5)) {
      console.log(`  ${file.path}\n  -> ${file.target}\n`)
    }
    console.log('Volve a correr con --apply para aplicarlo.\n')
    exit(0)
  }

  const moved: { from: string, to: string }[] = []
  try {
    for (const file of planned) {
      if (alreadyMoved.has(file.id)) continue
      await moveStored(mediaRoot, file.path, file.target)
      moved.push({ from: file.path, to: file.target })
    }

    await pool.query('begin')
    for (const file of planned) {
      await pool.query('update media_files set path = $2 where id = $1', [file.id, file.target])
    }
    await pool.query('commit')
  } catch (error) {
    // Put every byte back before surfacing the failure. A half-migrated tree
    // with a rolled-back database is the worst outcome available here.
    await pool.query('rollback').catch(() => {})
    for (const move of moved.reverse()) {
      await moveStored(mediaRoot, move.to, move.from).catch(() => {})
    }
    throw error
  }

  const after = generateMapData(fromRows(await readCatalog(pool)))

  if (withoutFilePaths(before) !== withoutFilePaths(after)) {
    console.error('\nLa migracion cambio algo ademas de las rutas. Revisar antes de publicar.')
    exit(1)
  }

  const changed = after.contents.filter(
    (content, index) =>
      'file' in content &&
      'file' in before.contents[index]! &&
      content.file !== (before.contents[index] as { file: string }).file,
  ).length

  console.log(`\n${moved.length} archivo(s) movidos.`)
  console.log(`${changed} ruta(s) cambiaron en el mapa; todo lo demas quedo identico.\n`)
} finally {
  await pool.end()
}
