/**
 * The identifier rule the legacy editor used, reproduced exactly.
 *
 * It matters beyond cosmetics: a medium's id becomes the prefix of every
 * campaign id the map publishes (`<mediumId>-nota-3`). Changing how ids are
 * minted would silently renumber references in published data.
 */

const MAX_LENGTH = 70;
const FALLBACK = 'medio';

/**
 * `Radio Universidad de Guadalajara` -> `radio-universidad-de-guadalajara`
 *
 * Diacritics are stripped rather than transliterated, so `México` becomes
 * `mexico`, matching what is already in production.
 */
export function slug(value: string): string {
  const normalised = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, '');

  return normalised || FALLBACK;
}

/**
 * Appends `-2`, `-3`… until the slug is free.
 *
 * Numbering starts at 2 because the first holder keeps the bare slug — the
 * same convention the legacy editor used, so imported ids stay stable.
 */
export function uniqueSlug(value: string, taken: ReadonlySet<string>): string {
  const base = slug(value);
  if (!taken.has(base)) return base;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
