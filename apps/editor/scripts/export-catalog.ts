/**
 * Exporta el catálogo de un mapa como el mismo documento que lo importa.
 *
 *   npm run export-catalog -- --map redmexico > proyecto-actual.json
 *   npm run export-catalog -- --map redmexico --out proyecto-actual.json
 *   npm run export-catalog -- --map redmexico --sin-rutas
 *
 * La salida es un `Project`: exactamente la forma de `datos/proyecto.json`, el
 * documento que lee `import-legacy`. No es una representación nueva inventada
 * para esto —`fromRows` ya devuelve ese tipo, y `round-trip.test.ts` comprueba
 * que la vuelta completa por las filas no pierde nada— así que lo que sale de
 * acá se compara contra el archivo de la herramienta anterior sin traducir nada
 * en el medio. Verificado: exportar un catálogo recién importado devuelve un
 * documento idéntico al original.
 *
 * Eso lo vuelve también una copia restaurable, pero **solo sobre su propio
 * mapa**: `import-legacy --map <el mismo> --force`. Importarlo en otro mapa
 * falla con `media_pkey` duplicado, y está bien que falle — los ids de medio
 * son únicos en todo el sistema y no por mapa, porque son la clave que
 * referencian los archivos, los temas y la cobertura.
 *
 * Para qué existe: alguien que trabajó con el sistema de Windows tiene su
 * último `proyecto.json` en local y necesita confirmar que no quedó ningún dato
 * afuera. Hasta ahora la única forma de verlo era entrar al editor y revisar
 * los 32 medios a ojo.
 *
 * **Las rutas de archivo van a diferir, y eso es correcto.** El documento
 * legacy las derivaba del nombre del medio
 * (`contenidos/cmx/aprende-cdmx/testigo-1.mp4`) y en la base están bajo el
 * esquema por id (`contenidos/aprende/archivo-<id>-testigo-1.mp4`), porque
 * `migrate-paths` las reescribió a propósito: así renombrar un medio es un
 * update y no mover 2 GB de video. Un diff sin más muestra las 66 rutas como
 * distintas y parece que falta todo. `--sin-rutas` las vacía para que la
 * comparación hable de los datos.
 */
import { writeFileSync } from 'node:fs'
import { argv, env, exit, stdout } from 'node:process'

import pg from 'pg'
import { fromRows } from '@mapa-mexico/project-store'
import { getMapBySlug, readCatalog } from '@mapa-mexico/postgres'

function flag(name: string): string | undefined {
  const at = argv.indexOf(`--${name}`)
  return at === -1 ? undefined : argv[at + 1]
}

const slug = flag('map') ?? 'redmexico'
const out = flag('out')
const sinRutas = argv.includes('--sin-rutas')
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

  const project = fromRows(await readCatalog(pool, map.id))

  if (sinRutas) {
    for (const medium of project.media) {
      for (const file of medium.files) file.file = ''
    }
  }

  const json = `${JSON.stringify(project, null, 2)}\n`

  if (out) {
    writeFileSync(out, json)
    // El resumen va por stderr para no ensuciar la salida cuando se redirige.
    console.error(
      `Catálogo de /${map.slug} escrito en ${out}: ` +
      `${project.media.length} medios, ${project.states.length} estados, ` +
      `${project.media.reduce((n, m) => n + m.files.length, 0)} testigos` +
      `${sinRutas ? ' (sin rutas de archivo)' : ''}.`,
    )
  } else {
    stdout.write(json)
  }
} finally {
  await pool.end()
}
