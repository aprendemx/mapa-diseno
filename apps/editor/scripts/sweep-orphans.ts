/**
 * Finds media on disk that no catalogue row points at.
 *
 *   npm run sweep                                  # informe
 *   npm run sweep -- --delete --older-than 30      # borra los de mas de 30 dias
 *
 * The old editor did this implicitly, on every save, with no confirmation and
 * no age threshold: anything under `contenidos/` missing from the incoming
 * payload was deleted immediately. A client-side bug or a half-sent request
 * was enough to destroy real video.
 *
 * Here it is a separate command, it defaults to reporting, and even with
 * --delete it refuses to touch anything newer than the threshold — because the
 * most likely orphan is a file uploaded seconds ago whose row has not landed
 * yet, and that is precisely the one worth keeping.
 */
import { stat, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { argv, env, exit } from 'node:process'

import pg from 'pg'
import { listStored, resolveInRoot } from '@mapa-mexico/file-storage'
import { listReferencedPaths } from '@mapa-mexico/postgres'

function flag(name: string): string | undefined {
  const at = argv.indexOf(`--${name}`)
  return at === -1 ? undefined : argv[at + 1]
}

/** Icons the map loads by convention, not through the catalogue. */
const PROTECTED = /^contenidos\/logos-redes\//

const mediaRoot = flag('root') ?? '../..'
const remove = argv.includes('--delete')
const olderThanDays = Number(flag('older-than') ?? 30)
const databaseUrl = env['NUXT_DATABASE_URL'] ?? env['DATABASE_URL']

if (!databaseUrl) {
  console.error('Falta NUXT_DATABASE_URL (o DATABASE_URL) en el entorno.')
  exit(1)
}
if (!Number.isFinite(olderThanDays) || olderThanDays < 0) {
  console.error('--older-than espera un numero de dias.')
  exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })
const megabytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)

try {
  const [stored, referenced] = await Promise.all([
    listStored(mediaRoot),
    listReferencedPaths(pool),
  ])

  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000
  const orphans: { path: string, bytes: number, ageDays: number, sweepable: boolean }[] = []

  for (const path of stored) {
    if (referenced.has(path) || PROTECTED.test(path)) continue
    const info = await stat(resolveInRoot(mediaRoot, path))
    orphans.push({
      path,
      bytes: info.size,
      ageDays: Math.floor((Date.now() - info.mtimeMs) / 86_400_000),
      sweepable: info.mtimeMs < cutoff,
    })
  }

  const total = orphans.reduce((sum, orphan) => sum + orphan.bytes, 0)
  const sweepable = orphans.filter((orphan) => orphan.sweepable)

  console.log(`\n${stored.length} archivo(s) en disco, ${referenced.size} referenciado(s).`)
  console.log(`${orphans.length} huerfano(s), ${megabytes(total)} MB.`)
  console.log(`${sweepable.length} con mas de ${olderThanDays} dia(s).\n`)

  for (const orphan of orphans.slice(0, 20)) {
    const mark = orphan.sweepable ? ' ' : '*'
    console.log(`  ${mark} ${orphan.path}  (${megabytes(orphan.bytes)} MB, ${orphan.ageDays} d)`)
  }
  if (orphans.length > 20) console.log(`  ... y ${orphans.length - 20} mas`)
  if (orphans.length > sweepable.length) {
    console.log(`\n  * demasiado reciente para borrar con --older-than ${olderThanDays}`)
  }

  if (!remove) {
    console.log('\nInforme unicamente. Agrega --delete para borrarlos.\n')
    exit(0)
  }

  for (const orphan of sweepable) {
    await unlink(resolve(mediaRoot, orphan.path))
  }
  const freed = sweepable.reduce((sum, orphan) => sum + orphan.bytes, 0)
  console.log(`\n${sweepable.length} archivo(s) borrados, ${megabytes(freed)} MB liberados.\n`)
} finally {
  await pool.end()
}
