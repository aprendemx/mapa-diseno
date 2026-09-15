import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { MEDIA_STOP_SCRIPT, generateMapData, renderMap } from '@mapa-mexico/map-generator'
import type { MapData } from '@mapa-mexico/map-generator'
import { checkPublishable, fromRows } from '@mapa-mexico/project-store'
import type { Problem } from '@mapa-mexico/project-store'
import { statStored } from '@mapa-mexico/file-storage'
import { writeFileAtomic } from '@mapa-mexico/file-storage'
import { getPublication, readCatalog, recordPublication } from '@mapa-mexico/postgres'
import type { Pooled, PublicationSummary, SessionUser } from '@mapa-mexico/postgres'

export interface PublishRefusal {
  ok: false
  problems: Problem[]
}

export interface PublishSuccess {
  ok: true
  publication: PublicationSummary
  bytes: number
}

/**
 * The template is read at publish time, so a corrected `mapa-base.html` takes
 * effect on the next publish without rebuilding the app. The media stop script
 * travels inside the bundle: a path into `src/` resolves in development and
 * not in a container.
 */
async function readTemplates() {
  const { templatePath } = useRuntimeConfig()
  return {
    template: await readFile(resolve(templatePath), 'utf8'),
    mediaStop: MEDIA_STOP_SCRIPT,
  }
}

/**
 * Checks the catalogue without touching anything.
 *
 * Its own endpoint as well as the first step of publishing, so the editor can
 * say what is wrong before anyone commits to it.
 */
export async function inspect(db: Pooled): Promise<Problem[]> {
  const project = fromRows(await readCatalog(db))
  const root = mediaRoot()
  return checkPublishable(project, async (path) => Boolean(await statStored(root, path)))
}

async function put(data: MapData): Promise<number> {
  const { template, mediaStop } = await readTemplates()
  const html = renderMap({ template, mediaStop, data })

  const { publishDir } = useRuntimeConfig()
  await writeFileAtomic(resolve(publishDir, 'index.html'), html)
  return Buffer.byteLength(html)
}

/**
 * Validates, renders and swaps — in that order, and nothing before its turn.
 *
 * The legacy generator validated *after* it had written the JSON, moved the
 * files and deleted the orphans, so a failed check left the disk changed and
 * the published map stale. Here a refusal means nothing happened at all.
 */
export async function publishCatalogue(
  db: Pooled,
  user: SessionUser,
): Promise<PublishRefusal | PublishSuccess> {
  const project = fromRows(await readCatalog(db))
  const root = mediaRoot()

  const problems = await checkPublishable(project, async (path) =>
    Boolean(await statStored(root, path)),
  )
  if (problems.length > 0) return { ok: false, problems }

  const data = generateMapData(project)
  const bytes = await put(data)

  const publication = await recordPublication(db, {
    userId: user.id,
    userName: user.name,
    mapData: data,
  })
  return { ok: true, publication, bytes }
}

/**
 * Re-publishes an earlier publication's data.
 *
 * It re-renders rather than restoring stored HTML, so a rollback picks up the
 * current template — which is what you want when the rollback exists because
 * something about the page itself went wrong. It also does not touch the
 * catalogue: rolling back the site is not the same as undoing someone's edits,
 * and conflating the two loses work.
 */
export async function restorePublication(
  db: Pooled,
  user: SessionUser,
  publicationId: string,
): Promise<PublishSuccess | undefined> {
  const previous = await getPublication(db, publicationId)
  if (!previous) return undefined

  const bytes = await put(previous.mapData)
  const publication = await recordPublication(db, {
    userId: user.id,
    userName: user.name,
    mapData: previous.mapData,
    restoredFrom: previous.id,
  })
  return { ok: true, publication, bytes }
}
