<script setup lang="ts">
import type { UploadJob } from '~/composables/useChunkedUpload'

const props = defineProps<{
  mediumId: string
  /**
   * `asset` y no `api`: las subidas salen por `XMLHttpRequest`, que es tráfico
   * crudo del navegador y no lleva el prefijo de la app. Lo mismo que hace
   * `WitnessList` con los `src` de los previsualizadores.
   */
  asset: (path?: string) => string
}>()
const emit = defineEmits<{ uploaded: [], error: [message: string] }>()

const { limits, loadLimits, humanBytes, humanDuration, run, cancel } = useChunkedUpload({
  asset: props.asset,
  mediumId: props.mediumId,
})

const jobs = ref<UploadJob[]>([])
const dragging = ref(false)

const pending = computed(() =>
  jobs.value.filter((job) => job.state === 'esperando' || job.state === 'subiendo'),
)
const busy = computed(() => pending.value.length > 0)

const done = computed(() => jobs.value.filter((job) => job.state === 'listo').length)
const totalBytes = computed(() => jobs.value.reduce((sum, job) => sum + job.bytes, 0))
const sentBytes = computed(() =>
  jobs.value.reduce((sum, job) => sum + Math.min(job.sent + job.inflight, job.bytes), 0),
)

const percentOf = (job: UploadJob) =>
  job.bytes === 0 ? 0 : Math.min(100, Math.round(((job.sent + job.inflight) / job.bytes) * 100))

const etaOf = (job: UploadJob) =>
  job.speed > 0 ? humanDuration((job.bytes - job.sent - job.inflight) / job.speed) : ''

onMounted(() => {
  // Los topes se piden al entrar, no al elegir un archivo: la interfaz tiene
  // que poder decir qué acepta antes de que alguien lo averigüe fallando.
  loadLimits().catch(() => {})
})

/**
 * Avisa antes de cerrar con una subida en curso.
 *
 * El servidor conserva lo que ya llegó, pero el navegador pierde el `File` al
 * recargar y no lo puede volver a leer sin que la persona lo elija de nuevo.
 * Así que cerrar la pestaña sí cuesta volver a empezar, y conviene decirlo.
 */
function guardUnload(event: BeforeUnloadEvent) {
  if (!busy.value) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', guardUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', guardUnload))

/**
 * Procesa la cola de uno en uno.
 *
 * Secuencial y no en paralelo: varios videos a la vez se pelean por el mismo
 * enlace de subida y todos tardan más. Con trozos además sería peor, porque
 * cada uno multiplicaría las peticiones en vuelo.
 */
let pumping = false
async function pump() {
  if (pumping) return
  pumping = true
  try {
    for (;;) {
      const next = jobs.value.find((job) => job.state === 'esperando')
      if (!next) break
      try {
        await run(next)
        if (next.state === 'listo') emit('uploaded')
      } catch {
        // El motivo ya quedó en `job.message`, que es donde la persona lo lee.
        emit('error', next.message ?? 'No se pudo subir el archivo.')
      }
    }
  } finally {
    pumping = false
  }
}

function enqueue(chosen: File[]) {
  for (const file of chosen) {
    jobs.value.push(
      // `shallowReactive` y no `reactive`: el trabajo guarda un `File` y un
      // `XMLHttpRequest`, y envolver objetos nativos en un proxy es la clase de
      // detalle que funciona hasta que un día `abort()` deja de hacerlo. Todo
      // lo que cambia acá es plano.
      shallowReactive<UploadJob>({
        file,
        name: file.name,
        bytes: file.size,
        sent: 0,
        inflight: 0,
        state: 'esperando',
        speed: 0,
        attempt: 0,
      }),
    )
  }
  void pump()
}

function pick(event: Event) {
  const element = event.target as HTMLInputElement
  enqueue(Array.from(element.files ?? []))
  // Se limpia para que volver a elegir el mismo archivo dispare el `change`.
  element.value = ''
}

function drop(event: DragEvent) {
  dragging.value = false
  enqueue(Array.from(event.dataTransfer?.files ?? []))
}

/** Reintentar no vuelve a empezar: el motor le pregunta al servidor qué tiene. */
function retry(job: UploadJob) {
  job.state = 'esperando'
  job.message = undefined
  void pump()
}

function discard(job: UploadJob) {
  if (job.state === 'subiendo' || job.state === 'esperando') void cancel(job)
  jobs.value = jobs.value.filter((other) => other !== job)
}

function clearFinished() {
  jobs.value = jobs.value.filter(
    (job) => job.state === 'esperando' || job.state === 'subiendo',
  )
}
</script>

<template>
  <div class="uploader">
    <div
      class="drop"
      :class="{ over: dragging, busy }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="drop"
    >
      <label class="picker">
        <input
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          @change="pick"
        >
        <span class="hint">
          Arrastrá archivos acá, o elegilos.
          <template v-if="limits">
            Hasta {{ humanBytes(limits.maxUploadBytes) }} cada uno.
          </template>
        </span>
      </label>
      <p v-if="limits" class="formats">{{ limits.extensions.join('  ') }}</p>
    </div>

    <p v-if="jobs.length > 1" class="summary" role="status">
      {{ done }} de {{ jobs.length }} —
      {{ humanBytes(sentBytes) }} de {{ humanBytes(totalBytes) }}
      <button
        v-if="!busy"
        type="button"
        class="link"
        @click="clearFinished"
      >limpiar</button>
    </p>

    <ul v-if="jobs.length" class="jobs">
      <li v-for="(job, index) in jobs" :key="index" :class="job.state">
        <div class="row">
          <span class="file" :title="job.name">{{ job.name }}</span>
          <span class="size">{{ humanBytes(job.bytes) }}</span>

          <span class="state">
            <template v-if="job.state === 'subiendo'">
              {{ percentOf(job) }}%
              <template v-if="job.speed > 0">
                · {{ humanBytes(job.speed) }}/s
                <template v-if="etaOf(job)"> · falta {{ etaOf(job) }}</template>
              </template>
              <template v-if="job.attempt > 1"> · reintento {{ job.attempt }}</template>
            </template>
            <template v-else-if="job.state === 'esperando'">en cola</template>
            <template v-else-if="job.state === 'listo'">listo</template>
            <template v-else-if="job.state === 'cancelado'">cancelado</template>
            <template v-else>no se pudo</template>
          </span>

          <button
            v-if="job.state === 'error' || job.state === 'cancelado'"
            type="button"
            class="act"
            @click="retry(job)"
          >Reintentar</button>
          <button
            v-else-if="job.state === 'subiendo' || job.state === 'esperando'"
            type="button"
            class="act"
            @click="cancel(job)"
          >Cancelar</button>
          <button type="button" class="close" title="Quitar de la lista" @click="discard(job)">
            ×
          </button>
        </div>

        <progress
          v-if="job.state === 'subiendo' || job.state === 'esperando'"
          :value="percentOf(job)"
          max="100"
        />
        <p v-if="job.message" class="why">{{ job.message }}</p>
        <p v-if="job.state === 'error' && job.sent > 0" class="why resume">
          Ya se subieron {{ humanBytes(job.sent) }}. Reintentar continúa desde ahí.
        </p>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.drop {
  border: 1px dashed var(--line); border-radius: 8px;
  padding: 0.9rem 1rem; transition: border-color 0.15s, background 0.15s;
}
.drop.over { border-color: var(--accent); background: #f4f6f1; }
.picker { display: block; margin: 0; }
.picker input { padding: 0.25rem 0; border: 0; width: auto; }
.hint { display: block; margin-top: 0.4rem; font-size: 0.82rem; color: var(--muted); }
.formats {
  margin: 0.45rem 0 0; font-size: 0.72rem; color: var(--muted);
  font-variant-numeric: tabular-nums; opacity: 0.75; word-spacing: 0.1rem;
}

.summary {
  margin: 0.7rem 0 0; font-size: 0.82rem; color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.link {
  border: 0; background: none; padding: 0; margin-left: 0.4rem;
  color: var(--accent); font: inherit; cursor: pointer; text-decoration: underline;
}

.jobs { list-style: none; padding: 0; margin: 0.6rem 0 0; display: grid; gap: 0.55rem; }
.jobs li {
  border: 1px solid var(--line); border-radius: 6px;
  padding: 0.5rem 0.6rem; background: var(--surface);
}
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto auto;
  gap: 0.6rem; align-items: center; font-size: 0.85rem;
}
.file { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.size, .state { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 0.8rem; }

.jobs li.error .state, .jobs li.cancelado .state { color: var(--danger); }
.jobs li.listo .state { color: var(--accent); font-weight: 600; }

.act { padding: 0.15rem 0.5rem; font-size: 0.78rem; }
.close {
  border: 0; background: none; padding: 0 0.2rem; line-height: 1;
  color: var(--muted); cursor: pointer; font-size: 1rem;
}
.close:hover { color: var(--danger); }

progress { width: 100%; height: 0.4rem; margin-top: 0.45rem; display: block; }
.why { margin: 0.4rem 0 0; font-size: 0.78rem; color: var(--danger); }
.why.resume { color: var(--muted); }

@media (max-width: 34rem) {
  .row { grid-template-columns: minmax(0, 1fr) auto auto; }
  .size { display: none; }
}
</style>
