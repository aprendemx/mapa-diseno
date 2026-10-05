/**
 * Finds media on disk that no catalogue row points at.
 *
 *   npm run sweep -- --map redmexico                     # informe de un mapa
 *   npm run sweep -- --all-maps                          # informe de todos
 *   npm run sweep -- --all-maps --delete --older-than 90  # borra
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
import { getMapBySlug, listMaps, listMedia, listReferencedPaths } from '@mapa-mexico/postgres'

function flag(name: string): string | undefined {
  const at = argv.indexOf(`--${name}`)
  return at === -1 ? undefined : argv[at + 1]
}

/** Icons the map loads by convention, not through the catalogue. */
const PROTECTED = /^contenidos\/logos-redes\//

const slug = flag('map') ?? 'redmexico'
const siteRoot = flag('site') ?? env['NUXT_SITE_ROOT'] ?? '../../sitio'
const remove = argv.includes('--delete')
// El valor vive en el entorno para que la linea del cron no lleve numeros
// sueltos que despues nadie sabe de donde salieron.
const olderThanDays = Number(flag('older-than') ?? env['RETENER_ARCHIVOS_DIAS'] ?? 90)
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

// --all-maps existe para el cron: un barrido que cubra solo el mapa que alguien
// nombro en el crontab deja los demas creciendo sin techo.
const mapas = argv.includes('--all-maps')
  ? await listMaps(pool)
  : await (async () => {
      const uno = await getMapBySlug(pool, slug)
      if (!uno) {
        console.error(`No existe el mapa "${slug}".`)
        await pool.end()
        exit(1)
      }
      return [uno]
    })()

let totalBorrados = 0
let totalLiberado = 0

try {
  for (const map of mapas) {
    // Cada mapa tiene su propio arbol y sus propias referencias. Barrer con las
    // referencias de otro mapa borraria archivos vivos.
    const mediaRoot = flag('root') ?? `${siteRoot}/${map.slug}`

    const [stored, referenced, medios] = await Promise.all([
      listStored(mediaRoot),
      listReferencedPaths(pool, map.id),
      listMedia(pool, map.id),
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

    const total = orphans.reduce((sum, o) => sum + o.bytes, 0)
    const sweepable = orphans.filter((o) => o.sweepable)

    console.log(`\nMapa /${map.slug} — ${mediaRoot}`)
    console.log(`${stored.length} archivo(s) en disco, ${referenced.size} referenciado(s).`)

    console.log(`${orphans.length} huerfano(s), ${megabytes(total)} MB.`)
    console.log(`${sweepable.length} con mas de ${olderThanDays} dia(s).`)

    for (const orphan of orphans.slice(0, 10)) {
      console.log(`  ${orphan.sweepable ? ' ' : '*'} ${orphan.path}` +
        `  (${megabytes(orphan.bytes)} MB, ${orphan.ageDays} d)`)
    }
    if (orphans.length > 10) console.log(`  ... y ${orphans.length - 10} mas`)

    if (!remove) continue

    // Guarda de radio de dano, no de causa. Borrar casi todo lo que hay en un
    // arbol es alarmante sea cual sea el motivo --una consulta mal acotada, un
    // mapa importado a medias, un volumen montado donde no debia-- y la
    // proporcion se ve sin saber por que.
    //
    // No se mira si el catalogo referencia cero archivos: un medio sin archivos
    // es normal, asi que un mapa pequeno da cero referencias legitimamente.
    const proporcion = stored.length === 0 ? 0 : sweepable.length / stored.length
    if (sweepable.length > 20 && proporcion > 0.8 && !argv.includes('--force')) {
      console.error(
        `\nBorraria ${sweepable.length} de ${stored.length} archivos de /${map.slug} ` +
        `(${Math.round(proporcion * 100)} %). Eso es casi todo el arbol.\n` +
        'Revisa el informe y volve a correr con --force si de verdad corresponde.',
      )
      exit(1)
    }

    for (const orphan of sweepable) {
      await unlink(resolve(mediaRoot, orphan.path))
    }
    totalBorrados += sweepable.length
    totalLiberado += sweepable.reduce((sum, o) => sum + o.bytes, 0)
  }

  if (!remove) {
    console.log('\nInforme unicamente. Agrega --delete para borrarlos.\n')
  } else {
    console.log(`\n${totalBorrados} archivo(s) borrados, ${megabytes(totalLiberado)} MB liberados.\n`)
  }
} finally {
  await pool.end()
}
