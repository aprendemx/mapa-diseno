import { slug } from '@mapa-mexico/project-store';

/**
 * Where a file lives on disk, and why it lives there.
 *
 * The legacy editor derived the path from the medium's *name*:
 * `contenidos/<estado>/<slug del nombre>/<slug del archivo>.mp4`. Renaming a
 * medium therefore rewrote the path of every one of its files, and the editor
 * physically copied them. Moving a medium to another state did the same. With
 * 2.2 GB of video, that is minutes of disk churn to change a label — and a
 * window in which a crash leaves files in two places.
 *
 * Here the path is derived from identifiers that never change. Renaming is a
 * database update and nothing else.
 */

/** Files the editor accepts. Anything else is refused on upload. */
export const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif',
  '.mp4', '.webm', '.mov', '.m4v', '.mpeg', '.mpg',
  '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac',
]);

export const ROOT = 'contenidos';

/** Kept short: the id already guarantees uniqueness, the words are for humans. */
const LABEL_LENGTH = 40;

export type FileKind = 'imagen' | 'video' | 'audio';

const AUDIO = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);
const VIDEO = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mpeg', '.mpg']);

/** Lowercased, with the leading dot. `''` when there is none. */
export function extensionOf(filename: string): string {
  const at = filename.lastIndexOf('.');
  if (at <= 0 || at === filename.length - 1) return '';
  return filename.slice(at).toLowerCase();
}

export const isAllowedExtension = (filename: string): boolean =>
  ALLOWED_EXTENSIONS.has(extensionOf(filename));

/**
 * Classifies by extension alone.
 *
 * The legacy editor trusted the browser's reported MIME type and stored the
 * result without ever rechecking it, so a mislabelled file rendered as the
 * wrong element in the map with no error anywhere. The extension is what the
 * map's `<video>`/`<audio>` tag has to agree with, so it is what decides.
 */
export function kindOf(filename: string): FileKind {
  const extension = extensionOf(filename);
  if (AUDIO.has(extension)) return 'audio';
  if (VIDEO.has(extension)) return 'video';
  return 'imagen';
}

/**
 * `contenidos/<mediumId>/<fileId>-<etiqueta>.<ext>`
 *
 * `mediumId` is frozen at creation and `fileId` is unique, so this path is
 * stable for the life of the file. The label is decoration for whoever is
 * looking at the directory; nothing reads it back.
 */
export function storagePath(
  mediumId: string,
  fileId: string,
  originalFilename: string,
): string {
  const extension = extensionOf(originalFilename);
  const base = originalFilename.slice(0, originalFilename.length - extension.length);
  const label = slug(base).slice(0, LABEL_LENGTH).replace(/-+$/, '');

  const name = label ? `${fileId}-${label}${extension}` : `${fileId}${extension}`;
  return `${ROOT}/${mediumId}/${name}`;
}

/**
 * Rejects anything that would escape the media root once resolved.
 *
 * Paths come out of the database, which is not the same as coming out of
 * nowhere: a row written before this rule existed, or by a future bug, must
 * not be able to make the server read `/etc/passwd`.
 */
export function isSafeRelativePath(relativePath: string): boolean {
  if (relativePath.includes('\0')) return false;
  if (relativePath.startsWith('/') || /^[a-zA-Z]:/.test(relativePath)) return false;

  const segments = relativePath.split(/[\\/]/);
  if (segments[0] !== ROOT) return false;
  if (segments.length < 2) return false;

  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}
