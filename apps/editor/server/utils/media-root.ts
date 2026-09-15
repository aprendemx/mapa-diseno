import { resolve } from 'node:path'

/** Where `contenidos/` lives, absolute. Everything else resolves against it. */
export function mediaRoot(): string {
  return resolve(useRuntimeConfig().mediaRoot)
}

/** Hard ceiling on a single upload, in bytes. */
export function maxUploadBytes(): number {
  return Number(useRuntimeConfig().maxUploadBytes)
}

/** `archivo-<epoch>-<aleatorio>`, the shape the legacy ids already have. */
export function newFileId(): string {
  const random = Math.random().toString(36).slice(2, 7)
  return `archivo-${Date.now()}-${random}`
}
