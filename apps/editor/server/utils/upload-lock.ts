/**
 * Serializa las operaciones sobre una misma subida.
 *
 * `appendChunk` lee el tamaño del `.parcial` y después escribe. Entre esas dos
 * cosas hay un `await`, así que dos peticiones del mismo trozo pueden leer las
 * dos el mismo tamaño, las dos pasar la comprobación de offset, y las dos
 * agregar: el archivo queda con el trozo duplicado y un tamaño que ya no
 * corresponde a su contenido. La comprobación de offset sola no alcanza para
 * eso, porque el problema es justamente que las dos la pasan.
 *
 * El cliente sube un trozo por vez, así que esto no debería activarse nunca.
 * Está porque "no debería" no es una garantía cuando lo que está en juego es un
 * video corrupto que en un listado de directorio se ve perfecto: un reintento
 * disparado por un timeout del navegador mientras la petición original sigue
 * viva alcanza para provocarlo.
 *
 * Es por proceso. El `docker-compose.yml` corre un solo contenedor del editor,
 * así que alcanza; con más de una réplica esto habría que moverlo a un candado
 * en la base.
 */
const queues = new Map<string, Promise<void>>()

export function serialized<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve()

  // El mismo `work` en los dos lados: un trozo que falló no debe arrastrar al
  // que viene detrás, que es precisamente el que va a reanudar.
  const result = previous.then(work, work)

  // La cola guarda una versión que nunca rechaza. Si guardara `result`, un
  // rechazo que nadie más espera sería una unhandled rejection, y eso tumba el
  // proceso.
  const tail = result.then(
    () => {},
    () => {},
  )
  queues.set(key, tail)

  // Y se limpia sola, para que el Map no crezca una entrada por archivo subido
  // durante la vida del proceso.
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key)
  })

  return result
}
