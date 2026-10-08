<script setup lang="ts">
import type { PublicationSummary } from '@mapa-mexico/postgres'
import type { MapRow, Problem } from '@mapa-mexico/project-store'

const { api, link, slug } = useMap()

const { data: catalogue } = await useFetch<{ maps: MapRow[] }>('/api/maps')
const map = computed(() => catalogue.value?.maps.find((m) => m.slug === slug.value))
const { data: history, refresh } = await useFetch<{ publications: PublicationSummary[] }>(
  () => api('/publications'),
)

const problems = ref<Problem[]>([])
const checked = ref(false)
const busy = ref('')
const result = ref('')

const publications = computed(() => history.value?.publications ?? [])
const current = computed(() => publications.value[0])

const formatted = (value: Date | string) =>
  new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

async function check() {
  busy.value = 'revisando'
  result.value = ''
  try {
    const response = await $fetch<{ ok: boolean, problems: Problem[] }>(api('/publish-check'))
    problems.value = response.problems
    checked.value = true
    if (response.ok) result.value = 'El catálogo está listo para publicarse.'
  } finally {
    busy.value = ''
  }
}

async function publish() {
  busy.value = 'publicando'
  problems.value = []
  result.value = ''
  try {
    const response = await $fetch<{ bytes: number, unchanged: boolean }>(
      api('/publish'),
      { method: 'POST' },
    )
    result.value = response.unchanged
      ? 'No había cambios: la página se regeneró y el historial quedó igual.'
      : `Publicado. ${(response.bytes / 1024).toFixed(0)} KB en línea.`
    checked.value = false
    await refresh()
  } catch (cause) {
    const payload = (cause as { data?: { data?: { problems?: Problem[] } } })?.data?.data
    problems.value = payload?.problems ?? [
      { field: '', message: 'No se pudo publicar. Intenta de nuevo.' },
    ]
    checked.value = true
  } finally {
    busy.value = ''
  }
}

async function restore(publication: PublicationSummary) {
  const when = formatted(publication.publishedAt)
  if (!confirm(`¿Volver a publicar la versión del ${when}?\n\nNo se modifican los datos que estás editando: solo vuelve a línea esa versión del mapa.`)) return

  busy.value = 'restaurando'
  problems.value = []
  result.value = ''
  try {
    await $fetch(api(`/publications/${publication.id}/restore`), { method: 'POST' })
    result.value = `Se volvió a publicar la versión del ${when}.`
    await refresh()
  } catch (cause) {
    const payload = (cause as { data?: { data?: { problems?: Problem[] } } })?.data?.data
    problems.value = payload?.problems ?? [
      { field: '', message: 'No se pudo restaurar esa versión.' },
    ]
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <section class="publish">
    <NuxtLink :to="link()" class="back">&larr; Medios</NuxtLink>
    <h1>Publicar</h1>
    <p class="hint">
      Guardar cambia los datos. Publicar es lo que los pone en línea: valida todo
      primero y, si algo falla, no toca nada.
    </p>

    <p class="donde">
      <template v-if="map?.is_default">
        Este mapa se sirve en <code>/</code> — la portada del dominio — y también
        en <code>/{{ slug }}</code>.
      </template>
      <template v-else>
        Este mapa se sirve en <code>/{{ slug }}</code>. La portada del dominio
        entrega otro; se cambia desde la lista de mapas.
      </template>
    </p>

    <div class="current" v-if="current">
      <strong>En línea:</strong>
      versión del {{ formatted(current.publishedAt) }}, por {{ current.publishedByName }}
      <span class="muted">
        ({{ current.mediaCount }} medios &middot; {{ current.noteCount }} notas
        &middot; {{ current.witnessCount }} testigos)
      </span>
    </div>
    <p v-else class="current muted">Todavía no se publicó ninguna versión.</p>

    <div class="actions">
      <button type="button" :disabled="!!busy" @click="check">
        {{ busy === 'revisando' ? 'Revisando…' : 'Revisar' }}
      </button>
      <button type="submit" :disabled="!!busy" @click="publish">
        {{ busy === 'publicando' ? 'Publicando…' : 'Publicar ahora' }}
      </button>
      <span v-if="result" class="ok" role="status">{{ result }}</span>
    </div>

    <div v-if="problems.length" class="problems" role="alert">
      <p><strong>{{ problems.length }} problema(s).</strong> No se publicó nada.</p>
      <ul>
        <li v-for="(problem, index) in problems.slice(0, 40)" :key="index">
          {{ problem.message }}
        </li>
      </ul>
      <p v-if="problems.length > 40" class="muted">…y {{ problems.length - 40 }} más.</p>
    </div>
    <p v-else-if="checked" class="ok">Sin problemas.</p>

    <h2>Historial</h2>
    <p v-if="publications.length === 0" class="muted">Sin publicaciones todavía.</p>
    <ol v-else class="history">
      <li v-for="(publication, index) in publications" :key="publication.id">
        <span class="when">{{ formatted(publication.publishedAt) }}</span>
        <span class="who">{{ publication.publishedByName }}</span>
        <span class="counts">
          {{ publication.mediaCount }} medios &middot;
          {{ publication.noteCount }} notas &middot;
          {{ publication.witnessCount }} testigos
          <em v-if="publication.restoredFrom"> &middot; restauración</em>
        </span>
        <button
          v-if="index > 0"
          type="button"
          :disabled="!!busy"
          @click="restore(publication)"
        >Volver a esta</button>
        <span v-else class="tag">en línea</span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.publish { max-width: 52rem; }
.back { display: inline-block; margin-bottom: 1rem; color: var(--muted); text-decoration: none; }
.back:hover { color: var(--accent); }
h1 { margin: 0 0 0.25rem; font-size: 1.35rem; }
h2 { margin: 2rem 0 0.75rem; font-size: 1.05rem; }
.hint { margin: 0 0 0.75rem; color: var(--muted); font-size: 0.9rem; max-width: 40rem; }

.donde {
  margin: 0 0 1.25rem; padding: 0.6rem 0.85rem; border-radius: 8px;
  background: #eef2ee; border: 1px solid var(--line);
  font-size: 0.88rem; max-width: 40rem;
}
.donde code { background: #fff; padding: 0 0.3rem; border-radius: 3px; font-size: 0.85rem; }

.current {
  padding: 0.7rem 0.9rem; border: 1px solid var(--line); border-radius: 8px;
  background: var(--surface); font-size: 0.9rem; margin-bottom: 1rem;
}
.muted { color: var(--muted); }

.actions { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
.actions button[type='submit'] { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.ok { color: var(--accent); font-weight: 600; font-size: 0.9rem; }

.problems {
  margin-top: 1rem; padding: 0.8rem 1rem; border-radius: 8px;
  background: #fbecea; border: 1px solid #e8c9c3; color: #6d2317;
}
.problems p { margin: 0 0 0.4rem; }
.problems ul { margin: 0; padding-left: 1.1rem; font-size: 0.88rem; }

.history { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
.history li {
  display: grid; grid-template-columns: auto 1fr auto; gap: 0.2rem 1rem; align-items: center;
  padding: 0.65rem 0.85rem; background: var(--surface);
  border: 1px solid var(--line); border-radius: 8px;
}
.when { font-weight: 600; font-size: 0.9rem; }
.who { font-size: 0.85rem; color: var(--muted); }
.counts { grid-column: 1 / 3; font-size: 0.8rem; color: var(--muted); }
.history button { grid-row: 1 / span 2; grid-column: 3; }
.tag {
  grid-row: 1 / span 2; grid-column: 3;
  font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;
  color: var(--accent); background: #e4efe8; border-radius: 4px; padding: 0.15rem 0.5rem;
}
</style>
