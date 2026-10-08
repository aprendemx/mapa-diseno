import type { H3Event } from 'h3'
import type { MapRow } from '@mapa-mexico/project-store'
import { isAllowedExtension, storagePath } from '@mapa-mexico/file-storage'
import { getMedium } from '@mapa-mexico/postgres'

export interface UploadTarget {
  map: MapRow
  /** El árbol de multimedia de ese mapa. */
  root: string
  mediumId: string
  uploadId: string
  filename: string
  /** La ruta definitiva del archivo. El `.parcial` se deriva de ella. */
  storedPath: string
}

/**
 * Resuelve y valida a dónde escribe una subida.
 *
 * Las cuatro peticiones del ciclo —consultar, agregar, completar, cancelar—
 * derivan el destino de acá, del mismo id y el mismo nombre, con la misma
 * función. Eso es lo que permite que **no haya estado de sesión en ninguna
 * parte**: `storagePath` es idempotente y está documentada como tal, así que
 * dos peticiones con los mismos datos apuntan al mismo archivo sin que nadie
 * tenga que recordar nada entre una y otra.
 *
 * El nombre del archivo viaja en cada petición por ese motivo. Guardarlo en el
 * servidor sería otro estado que puede desincronizarse del disco, y el disco ya
 * es la única fuente de verdad del progreso.
 *
 * Revalida el medio en cada trozo, y no solo al empezar. Son dos consultas
 * rápidas por trozo, y lo que compran es que una subida a un medio que alguien
 * borró mientras tanto se detenga en lugar de seguir escribiendo bytes en un
 * directorio que ya no tiene quién lo referencie: un huérfano garantizado desde
 * el nacimiento.
 */
export async function uploadTarget(event: H3Event): Promise<UploadTarget> {
  const uploadId = getRouterParam(event, 'uploadId')!
  if (!isFileId(uploadId)) {
    throw createError({ statusCode: 400, statusMessage: 'Identificador de subida inválido.' })
  }

  const filename = (getQuery(event)['filename'] as string | undefined)?.trim()
  if (!filename) {
    throw createError({ statusCode: 400, statusMessage: 'Falta el nombre del archivo.' })
  }
  if (!isAllowedExtension(filename)) {
    throw createError({ statusCode: 415, statusMessage: 'Ese tipo de archivo no se admite.' })
  }

  const mediumId = getRouterParam(event, 'id')!
  const map = await currentMap(event)
  if (!(await getMedium(database(), map.id, mediumId))) {
    throw createError({ statusCode: 404, statusMessage: 'Ese medio no existe.' })
  }

  return {
    map,
    root: mapRoot(map),
    mediumId,
    uploadId,
    filename,
    storedPath: storagePath(mediumId, uploadId, filename),
  }
}

/**
 * La clave con la que se serializan las operaciones de una subida.
 *
 * Lleva el mapa porque los ids de medio son únicos en todo el sistema pero la
 * ruta en disco es por mapa, y lo que se protege es el archivo, no el id.
 */
export function uploadKey(target: UploadTarget): string {
  return `${target.map.id}:${target.storedPath}`
}
