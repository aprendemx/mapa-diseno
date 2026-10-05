<script setup lang="ts">
const props = defineProps<{ mediumId: string, api: (path?: string) => string }>()
const emit = defineEmits<{ uploaded: [], error: [message: string] }>()

interface Job {
  name: string
  percent: number
  state: 'subiendo' | 'listo' | 'error'
  message?: string
}

const jobs = ref<Job[]>([])
const input = useTemplateRef<HTMLInputElement>('input')

const busy = computed(() => jobs.value.some((job) => job.state === 'subiendo'))

/**
 * One request per file, body is the file itself.
 *
 * XMLHttpRequest rather than fetch for one reason: fetch reports no upload
 * progress, and a 400 MB video with no feedback is indistinguishable from a
 * frozen page.
 */
function upload(file: File, job: Job): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    const url = props.api(
      `/media/${props.mediumId}/files?filename=${encodeURIComponent(file.name)}`,
    )

    request.open('PUT', url)
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) job.percent = Math.round((event.loaded / event.total) * 100)
    })
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        job.state = 'listo'
        job.percent = 100
        resolve()
        return
      }
      let message = `Error ${request.status}`
      try {
        message = JSON.parse(request.responseText)?.statusMessage ?? message
      } catch { /* la respuesta no era JSON */ }
      job.state = 'error'
      job.message = message
      reject(new Error(message))
    })
    request.addEventListener('error', () => {
      job.state = 'error'
      job.message = 'Se cortó la conexión.'
      reject(new Error(job.message))
    })
    request.send(file)
  })
}

async function pick(event: Event) {
  const chosen = Array.from((event.target as HTMLInputElement).files ?? [])
  if (chosen.length === 0) return

  // Sequential, not parallel: several large videos at once compete for the
  // same uplink and every one of them slows down.
  for (const file of chosen) {
    const job = reactive<Job>({ name: file.name, percent: 0, state: 'subiendo' })
    jobs.value.push(job)
    try {
      await upload(file, job)
      emit('uploaded')
    } catch (cause) {
      emit('error', cause instanceof Error ? cause.message : 'No se pudo subir.')
    }
  }

  if (input.value) input.value.value = ''
}
</script>

<template>
  <div class="uploader">
    <label class="picker">
      <input
        ref="input"
        type="file"
        multiple
        accept="video/*,audio/*,image/*"
        :disabled="busy"
        @change="pick"
      >
    </label>

    <ul v-if="jobs.length" class="jobs">
      <li v-for="(job, index) in jobs" :key="index" :class="job.state">
        <span class="file">{{ job.name }}</span>
        <progress v-if="job.state === 'subiendo'" :value="job.percent" max="100" />
        <span class="state">
          {{ job.state === 'subiendo' ? `${job.percent}%` : job.message ?? 'listo' }}
        </span>
        <button v-if="job.state !== 'subiendo'" type="button" @click="jobs.splice(index, 1)">
          ×
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.picker input { padding: 0.5rem 0; border: 0; }

.jobs { list-style: none; padding: 0; margin: 0.75rem 0 0; display: grid; gap: 0.35rem; }
.jobs li {
  display: grid; grid-template-columns: 1fr 8rem auto auto;
  gap: 0.6rem; align-items: center; font-size: 0.85rem;
}
.file { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.state { color: var(--muted); font-variant-numeric: tabular-nums; }
.jobs li.error .state { color: var(--danger); }
.jobs li.listo .state { color: var(--accent); }
.jobs li.listo progress, .jobs li.error progress { display: none; }
progress { width: 100%; height: 0.5rem; }
button { padding: 0.1rem 0.4rem; line-height: 1; }
</style>
