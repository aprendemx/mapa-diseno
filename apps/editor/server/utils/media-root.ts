/** Tope de una subida, en bytes. */
export function maxUploadBytes(): number {
  return Number(useRuntimeConfig().maxUploadBytes)
}

/** `archivo-<epoch>-<aleatorio>`, la forma que ya tienen los ids legacy. */
export function newFileId(): string {
  const random = Math.random().toString(36).slice(2, 7)
  return `archivo-${Date.now()}-${random}`
}
