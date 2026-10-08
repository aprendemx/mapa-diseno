import { discardPartial } from '@mapa-mexico/file-storage'

/**
 * Cancela una subida en curso y se lleva los bytes a medias.
 *
 *   DELETE /api/maps/<slug>/media/<id>/uploads/<uploadId>?filename=x.mp4
 *
 * El barrido los recogería igual, pero recién pasada su ventana de retención.
 * Quien cancela una subida de 400 MB ya decidió que esos bytes no van: dejarlos
 * tres meses en disco sería cobrarle a otro una decisión que ya tomó.
 *
 * No toca el archivo definitivo: `discardPartial` solo conoce el `.parcial`. Un
 * cancelar que llegue tarde, después de completar, no borra nada.
 */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const target = await uploadTarget(event)

  await serialized(uploadKey(target), () => discardPartial(target.root, target.storedPath))

  setResponseStatus(event, 204)
  return null
})
