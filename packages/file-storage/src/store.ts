import { createWriteStream } from 'node:fs';
import {
  lstat, mkdir, readdir, readlink, rename, rm, stat, symlink, unlink, writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomBytes } from 'node:crypto';
import type { Readable } from 'node:stream';

import { ROOT, isSafeRelativePath } from './paths.ts';

export class UnsafePathError extends Error {}
export class FileTooLargeError extends Error {}

/** Resolves a stored path against the media root, refusing anything outside it. */
export function resolveInRoot(mediaRoot: string, relativePath: string): string {
  if (!isSafeRelativePath(relativePath)) {
    throw new UnsafePathError(`Ruta de archivo no permitida: ${relativePath}`);
  }

  const base = resolve(mediaRoot);
  const full = resolve(base, relativePath);

  // Belt and braces: the string rules above should already have caught this,
  // but symlinks and normalisation quirks are exactly what this class of bug
  // lives in, so the resolved path is checked too.
  if (full !== base && !full.startsWith(base + sep)) {
    throw new UnsafePathError(`Ruta de archivo fuera de la raíz: ${relativePath}`);
  }
  return full;
}

export interface WriteResult {
  path: string;
  bytes: number;
}

/**
 * Streams a body to disk and only then puts it in place.
 *
 * Two properties matter here, and the legacy editor had neither. The bytes
 * never accumulate in memory — it accepted uploads as base64 inside a JSON
 * body, so a 500 MB video became a ~670 MB string held by the browser, the
 * request and the server at once. And the destination either does not exist or
 * is complete: the upload lands on a temporary name and is renamed into place,
 * which is atomic on the same filesystem. A connection dropped mid-upload
 * leaves a `.part` file, never a truncated video that looks fine in a listing.
 */
export async function writeStreamed(
  mediaRoot: string,
  relativePath: string,
  body: Readable,
  options: { maxBytes: number },
): Promise<WriteResult> {
  const destination = resolveInRoot(mediaRoot, relativePath);
  await mkdir(dirname(destination), { recursive: true });

  const temporary = `${destination}.part-${randomBytes(6).toString('hex')}`;
  let bytes = 0;

  try {
    await pipeline(
      body,
      async function* (source) {
        for await (const chunk of source) {
          bytes += (chunk as Buffer).length;
          if (bytes > options.maxBytes) {
            throw new FileTooLargeError(
              `El archivo supera el límite de ${options.maxBytes} bytes.`,
            );
          }
          yield chunk;
        }
      },
      createWriteStream(temporary),
    );

    await rename(temporary, destination);
    return { path: relativePath, bytes };
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/**
 * Writes a file so that readers only ever see the old version or the new one.
 *
 * The published page is served by nginx while this runs. Writing in place would
 * expose a window in which a visitor gets half a document — and that window is
 * exactly when the page is most likely to be loaded, because someone just
 * pressed publish and went to look.
 */
export async function writeFileAtomic(absolutePath: string, contents: string): Promise<void> {
  await mkdir(dirname(absolutePath), { recursive: true });
  const temporary = `${absolutePath}.new-${randomBytes(6).toString('hex')}`;

  try {
    await writeFile(temporary, contents, 'utf8');
    await rename(temporary, absolutePath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function moveStored(
  mediaRoot: string,
  from: string,
  to: string,
): Promise<void> {
  const source = resolveInRoot(mediaRoot, from);
  const destination = resolveInRoot(mediaRoot, to);
  if (source === destination) return;

  await mkdir(dirname(destination), { recursive: true });
  await rename(source, destination);
}

export async function removeStored(mediaRoot: string, relativePath: string): Promise<boolean> {
  const target = resolveInRoot(mediaRoot, relativePath);
  try {
    await unlink(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function statStored(
  mediaRoot: string,
  relativePath: string,
): Promise<{ bytes: number } | undefined> {
  try {
    const info = await stat(resolveInRoot(mediaRoot, relativePath));
    return { bytes: info.size };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * Every file under the media root, as paths relative to it.
 *
 * Used by the sweeper to find blobs no row points at. `.part` leftovers are
 * included deliberately: an interrupted upload is exactly the kind of orphan
 * worth reporting.
 */
export async function listStored(mediaRoot: string): Promise<string[]> {
  const base = resolve(mediaRoot, ROOT);
  const found: string[] = [];

  async function walk(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }

    for (const entry of entries) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        found.push(relative(resolve(mediaRoot), full).split(sep).join('/'));
      }
    }
  }

  await walk(base);
  return found.sort();
}

/** Los dos enlaces que forman la raiz del sitio. */
export const ROOT_LINKS = ['index.html', ROOT] as const;

export interface RootLink {
  name: string;
  target: string;
  changed: boolean;
}

/**
 * Apunta la raiz del sitio al mapa indicado.
 *
 *   <sitio>/index.html  -> <slug>/index.html
 *   <sitio>/contenidos  -> <slug>/contenidos
 *
 * Asi y no copiando la pagina a la raiz porque la pagina referencia
 * `contenidos/...` relativo a si misma: con los enlaces, `/` y
 * `/contenidos/x.mp4` caen en el arbol del mapa sin reescribir una sola ruta
 * almacenada. Y cambiar de mapa predeterminado cuesta dos renames en lugar de
 * mover cerca de un giga.
 *
 * Idempotente: si ya apuntan donde deben, no toca nada.
 */
export async function pointRootAt(siteRoot: string, slug: string): Promise<RootLink[]> {
  const base = resolve(siteRoot);
  await mkdir(join(base, slug), { recursive: true });

  const results: RootLink[] = [];
  for (const name of ROOT_LINKS) {
    const path = join(base, name);
    const target = `${slug}/${name}`;

    let existing: string | undefined;
    try {
      const info = await lstat(path);
      if (!info.isSymbolicLink()) {
        // Un archivo real ahi es casi seguro una publicacion del sistema
        // anterior. Borrarlo sin avisar seria borrar la unica copia de algo.
        throw new UnsafePathError(
          `${path} existe y no es un enlace simbólico. Moverlo o borrarlo a mano.`,
        );
      }
      existing = await readlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    if (existing === target) {
      results.push({ name, target, changed: false });
      continue;
    }

    if (existing !== undefined) await unlink(path);
    await symlink(target, path);
    results.push({ name, target, changed: true });
  }
  return results;
}
