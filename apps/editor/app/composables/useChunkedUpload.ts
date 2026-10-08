/**
 * Subida de archivos por trozos, con reintento y reanudación.
 *
 * El editor subía cada archivo en una sola petición. Funcionaba mientras la
 * petición entera cupiera en lo que el camino de red tolera, y no cabe: Traefik
 * deja de leer un cuerpo a los 60 segundos por omisión, y Cloudflare rechaza
 * cualquiera de más de 100 MB. Con eso, el tamaño máximo que el editor aceptaba
 * de verdad no era un tamaño: era **un tamaño por cada velocidad de subida**. El
 * mismo archivo entraba desde la oficina y fallaba desde una casa, y los
 * reportes llegaban sin ningún patrón porque el patrón estaba en la conexión de
 * cada persona.
 *
 * Acá cada trozo es una petición corta que no se acerca al límite de nadie, y
 * el progreso que el servidor confirma es el que vale. Eso compra tres cosas
 * que antes no existían:
 *
 * - Un corte de conexión se reintenta solo, desde donde quedó. Para quien está
 *   subiendo, no pasó nada.
 * - Un reintento manual tampoco empieza de cero: le pregunta al servidor
 *   cuántos bytes tiene y sigue.
 * - Un archivo que el servidor no va a aceptar se rechaza **antes** de subir un
 *   kilobyte, con un mensaje que dice qué pasa.
 */

export interface UploadLimits {
  maxUploadBytes: number
  chunkBytes: number
  extensions: string[]
}

export type JobState = 'esperando' | 'subiendo' | 'listo' | 'error' | 'cancelado'

export interface UploadJob {
  file: File
  name: string
  bytes: number
  /** Bytes que el servidor confirmó. Nunca los que creemos haber mandado. */
  sent: number
  /** Bytes del trozo en vuelo. Es progreso visible, todavía no confirmado. */
  inflight: number
  state: JobState
  message?: string
  uploadId?: string
  startedAt?: number
  /** Promedio desde que arrancó, en bytes por segundo. `0` si no se sabe. */
  speed: number
  attempt: number
  request?: XMLHttpRequest
}

/** Hasta cuántas veces se reintenta un trozo antes de rendirse. */
const MAX_ATTEMPTS = 5

/** Estados que vale la pena reintentar: son del camino, no del archivo. */
const RETRYABLE = new Set([0, 408, 425, 429, 500, 502, 503, 504])

interface Reply {
  status: number
  text: string
}

class TransportError extends Error {}
class CancelledError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** 1000 y no 1024: es para leer, y los discos y las operadoras cuentan así. */
export function humanBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  const units = ['kB', 'MB', 'GB']
  let value = bytes
  let unit = -1
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}

export function humanDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  if (seconds < 60) return `${Math.ceil(seconds)} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

/**
 * Traduce un fallo a algo que una persona pueda leer.
 *
 * El `statusMessage` del servidor es la primera opción, pero no siempre llega:
 * un 413 de Cloudflare es una página HTML, así que el `JSON.parse` falla y el
 * editor mostraba `Error 413` pelado. Un número no es un mensaje.
 */
function describeFailure(status: number, text: string): string {
  const fromServer = (() => {
    try {
      const payload = JSON.parse(text) as { statusMessage?: string, message?: string }
      return payload.statusMessage ?? payload.message
    } catch {
      return undefined
    }
  })()
  if (fromServer) return fromServer

  switch (status) {
    case 0:
      return 'Se cortó la conexión. Al reintentar, la subida continúa desde donde quedó.'
    case 401:
      return 'Se cerró la sesión. Vuelve a iniciar sesión e intenta de nuevo.'
    case 413:
      return 'El archivo es más grande de lo que el servidor acepta.'
    case 415:
      return 'Ese tipo de archivo no se admite.'
    case 502:
    case 503:
    case 504:
      return 'El servidor no respondió a tiempo. Puedes reintentar.'
    default:
      return `El servidor respondió ${status}.`
  }
}

/** Lee `data` de una respuesta de error de h3, que es donde viaja `received`. */
function errorData(text: string): Record<string, unknown> {
  try {
    const payload = JSON.parse(text) as { data?: Record<string, unknown> }
    return payload.data ?? {}
  } catch {
    return {}
  }
}

/**
 * XHR y no `fetch` por una razón: `fetch` no informa progreso de subida, y un
 * archivo grande sin ninguna señal es indistinguible de una página colgada.
 *
 * Resuelve con cualquier código, incluido un 4xx: un 409 no es un fallo, es el
 * servidor corrigiendo la cuenta. Solo rechaza cuando no hubo respuesta.
 */
function send(
  method: string,
  url: string,
  body: Blob | null,
  job?: UploadJob,
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open(method, url)

    if (job) {
      job.request = request
      request.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) job.inflight = event.loaded
      })
    }

    request.addEventListener('load', () => {
      resolve({ status: request.status, text: request.responseText })
    })
    request.addEventListener('error', () => reject(new TransportError('sin respuesta')))
    request.addEventListener('timeout', () => reject(new TransportError('expiró')))
    request.addEventListener('abort', () => reject(new CancelledError('cancelado')))
    request.addEventListener('loadend', () => {
      if (job) job.request = undefined
    })

    request.send(body)
  })
}

export function useChunkedUpload(options: {
  /**
   * `asset` y no `api`, y esto no es un detalle: estas peticiones salen por
   * `XMLHttpRequest`, que es tráfico crudo del navegador. Nadie le agrega el
   * prefijo de la app, igual que a un `src` de `<video>`.
   *
   * El uploader anterior usaba `api`, así que pegaba en `/api/maps/…` cuando
   * Nitro sirve el API bajo `/admin/api/…`. Eso **no** daba 404: daba un `302`
   * a la URL correcta. Y el navegador manda el cuerpo entero a una URL que
   * responde la redirección sin leerlo, para después mandarlo otra vez al
   * destino real. Un video se subía dos veces, y la barra seguía al primer
   * intento —el que el navegador abandona— así que se congelaba a mitad y no
   * volvía a moverse.
   */
  asset: (path?: string) => string
  mediumId: string
}) {
  const { asset, mediumId } = options
  const limits = ref<UploadLimits>()

  /** Se consulta una vez: el editor no puede ser honesto sin saber los topes. */
  async function loadLimits(): Promise<UploadLimits> {
    if (!limits.value) {
      // `$fetch` sí recibe el prefijo de la app, así que acá va la ruta pelada.
      limits.value = await $fetch<UploadLimits>('/api/limits')
    }
    return limits.value
  }

  const base = (job: UploadJob) =>
    `${asset(`/media/${mediumId}/uploads`)}${job.uploadId ? `/${job.uploadId}` : ''}`

  const named = (job: UploadJob) => `filename=${encodeURIComponent(job.name)}`

  /**
   * Por qué este archivo no se va a poder subir, si es que no.
   *
   * Antes de gastar la subida de nadie. El servidor vuelve a aplicar las dos
   * reglas —esto no es una comprobación de seguridad— pero mientras el
   * navegador no las conociera, la única forma de descubrir el problema era a
   * mitad de la transferencia.
   */
  function refuse(file: File, allowed: UploadLimits): string | undefined {
    const dot = file.name.lastIndexOf('.')
    const extension = dot > 0 ? file.name.slice(dot).toLowerCase() : ''

    if (!allowed.extensions.includes(extension)) {
      return extension
        ? `No se admiten archivos ${extension}. Solo imágenes, video y audio.`
        : 'El archivo no tiene extensión, así que no se puede saber qué es.'
    }
    if (file.size === 0) {
      return 'El archivo está vacío.'
    }
    if (file.size > allowed.maxUploadBytes) {
      return `Pesa ${humanBytes(file.size)} y el máximo es ${humanBytes(allowed.maxUploadBytes)}.`
    }
    return undefined
  }

  /** Reintenta lo que es del camino; se rinde enseguida con lo que es del archivo. */
  async function withRetry(job: UploadJob, attempt: () => Promise<Reply>): Promise<Reply> {
    for (let tries = 1; ; tries += 1) {
      job.attempt = tries
      try {
        const reply = await attempt()
        if (reply.status < 400 || !RETRYABLE.has(reply.status) || tries >= MAX_ATTEMPTS) {
          return reply
        }
      } catch (error) {
        if (error instanceof CancelledError) throw error
        if (tries >= MAX_ATTEMPTS) throw error
      }
      // Espera creciente: si lo que se cayó fue el servidor, martillarlo cada
      // segundo no lo levanta más rápido.
      await sleep(Math.min(1000 * 2 ** (tries - 1), 15_000))
    }
  }

  /** Lo que el servidor dice que tiene. La única cuenta que vale. */
  async function serverHas(job: UploadJob): Promise<number> {
    const reply = await send('GET', `${base(job)}?${named(job)}`, null)
    if (reply.status !== 200) return 0
    return (JSON.parse(reply.text) as { received: number }).received
  }

  async function sendChunks(job: UploadJob, chunkBytes: number): Promise<void> {
    while (job.sent < job.bytes) {
      const slice = job.file.slice(job.sent, Math.min(job.sent + chunkBytes, job.bytes))
      const offset = job.sent

      const reply = await withRetry(job, () =>
        send('PATCH', `${base(job)}?${named(job)}&offset=${offset}`, slice, job),
      )

      job.inflight = 0

      if (reply.status === 200) {
        // El total lo dicta el servidor, no nuestra suma. Si entró medio trozo
        // antes de un corte, su número lo sabe y el nuestro no.
        job.sent = (JSON.parse(reply.text) as { received: number }).received
        const elapsed = (Date.now() - (job.startedAt ?? Date.now())) / 1000
        if (elapsed > 0.5) job.speed = job.sent / elapsed
        continue
      }

      // 409: perdimos la cuenta. No es un fallo ni consume un reintento — es el
      // servidor diciendo desde dónde seguir.
      if (reply.status === 409) {
        const received = Number(errorData(reply.text)['received'])
        if (Number.isInteger(received) && received >= 0 && received !== job.sent) {
          job.sent = received
          continue
        }
      }

      throw new Error(describeFailure(reply.status, reply.text))
    }
  }

  /** Sube un archivo de principio a fin. Reanuda si ya había empezado. */
  async function run(job: UploadJob): Promise<void> {
    const allowed = await loadLimits()

    const problem = refuse(job.file, allowed)
    if (problem) {
      job.state = 'error'
      job.message = problem
      throw new Error(problem)
    }

    job.state = 'subiendo'
    job.message = undefined
    job.startedAt = Date.now()

    try {
      if (!job.uploadId) {
        const opened = await withRetry(job, () =>
          send('POST', `${base(job)}?${named(job)}&bytes=${job.bytes}`, null),
        )
        if (opened.status !== 201) {
          throw new Error(describeFailure(opened.status, opened.text))
        }
        job.uploadId = (JSON.parse(opened.text) as { uploadId: string }).uploadId
      } else {
        // Reintento manual de un archivo que ya había empezado.
        job.sent = await serverHas(job)
      }

      await sendChunks(job, allowed.chunkBytes)

      const done = await withRetry(job, () =>
        send('POST', `${base(job)}/finish?${named(job)}&bytes=${job.bytes}`, null),
      )

      if (done.status === 409) {
        // Le falta algo: el servidor dice cuánto tiene y se completa el resto.
        const received = Number(errorData(done.text)['received'])
        if (Number.isInteger(received)) {
          job.sent = received
          await sendChunks(job, allowed.chunkBytes)
          const again = await withRetry(job, () =>
            send('POST', `${base(job)}/finish?${named(job)}&bytes=${job.bytes}`, null),
          )
          if (again.status !== 201) {
            throw new Error(describeFailure(again.status, again.text))
          }
        }
      } else if (done.status !== 201) {
        throw new Error(describeFailure(done.status, done.text))
      }

      job.sent = job.bytes
      job.inflight = 0
      job.state = 'listo'
    } catch (error) {
      job.inflight = 0
      if (error instanceof CancelledError) {
        job.state = 'cancelado'
        return
      }
      job.state = 'error'
      job.message = error instanceof Error
        ? error.message
        : 'No se pudo subir. Puedes reintentar.'
      throw error
    }
  }

  /**
   * Cancela y se lleva los bytes a medias.
   *
   * El barrido los recogería igual, pero recién pasada su ventana de retención.
   * Quien cancela ya decidió que no van.
   */
  async function cancel(job: UploadJob): Promise<void> {
    job.request?.abort()
    job.state = 'cancelado'
    job.inflight = 0
    if (!job.uploadId) return
    try {
      await send('DELETE', `${base(job)}?${named(job)}`, null)
    } catch {
      /* Si no se pudo avisar, el barrido se encarga. */
    }
  }

  return { limits, loadLimits, humanBytes, humanDuration, refuse, run, cancel }
}
