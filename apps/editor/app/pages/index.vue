<script setup lang="ts">
import type { MediumSummary } from '@mapa-mexico/postgres'

const { data, refresh, status } = await useFetch<{ media: MediumSummary[] }>('/api/media')

const search = ref('')
const busy = ref(false)

const media = computed(() => data.value?.media ?? [])

/** Accent-insensitive, so "mexico" finds "México". */
const fold = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es')

const visible = computed(() => {
  const needle = fold(search.value.trim())
  if (!needle) return media.value
  return media.value.filter((medium) => fold(medium.name).includes(needle))
})

const counters = computed(() => ({
  media: media.value.length,
  shown: media.value.filter((m) => m.active).length,
  states: new Set(media.value.filter((m) => m.active && m.stateId).map((m) => m.stateId)).size,
}))

/** Strips the `[[...]]` markers the map renders as emphasised place names. */
const plain = (name: string) => name.replace(/\[\[(.*?)\]\]/g, '$1')

async function createMedium() {
  busy.value = true
  try {
    const { id } = await $fetch<{ id: string }>('/api/media', {
      method: 'POST',
      body: {
        name: 'Medio sin nombre',
        stateId: '',
        active: true,
        notes: '',
        coverageText: '',
        coverageStates: [],
        socialEnabled: false,
        socialThemes: [],
      },
    })
    await navigateTo(`/medios/${id}`)
  } finally {
    busy.value = false
  }
}

async function remove(medium: MediumSummary) {
  const warning = medium.fileCount > 0
    ? `\n\nTiene ${medium.fileCount} archivo(s). Los archivos NO se borran del disco.`
    : ''
  if (!confirm(`¿Eliminar "${plain(medium.name)}"?${warning}`)) return

  busy.value = true
  try {
    await $fetch(`/api/media/${medium.id}`, { method: 'DELETE' })
    await refresh()
  } finally {
    busy.value = false
  }
}

async function sortAlphabetically() {
  const ids = [...media.value]
    .sort((a, b) => plain(a.name).localeCompare(plain(b.name), 'es', { sensitivity: 'base' }))
    .map((m) => m.id)

  busy.value = true
  try {
    await $fetch('/api/media-order', { method: 'PUT', body: { ids } })
    await refresh()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section>
    <div class="bar">
      <h1>Medios</h1>
      <div class="actions">
        <NuxtLink to="/apariencia" class="link">Apariencia</NuxtLink>
        <button type="button" :disabled="busy" @click="sortAlphabetically">Ordenar A–Z</button>
        <button type="button" :disabled="busy" @click="createMedium">+ Nuevo medio</button>
      </div>
    </div>

    <dl class="counters">
      <div><dt>Estados</dt><dd>32</dd></div>
      <div><dt>Con medios visibles</dt><dd>{{ counters.states }}</dd></div>
      <div><dt>Medios</dt><dd>{{ counters.media }}</dd></div>
      <div><dt>Visibles</dt><dd>{{ counters.shown }}</dd></div>
    </dl>

    <label class="search">
      <span class="sr-only">Buscar por nombre</span>
      <input v-model="search" type="search" placeholder="Buscar por nombre…">
    </label>

    <p v-if="status === 'pending'" class="muted">Cargando…</p>
    <p v-else-if="visible.length === 0" class="muted">
      {{ search ? 'Ningún medio coincide con esa búsqueda.' : 'Todavía no hay medios.' }}
    </p>

    <ul v-else class="list">
      <li v-for="medium in visible" :key="medium.id" :class="{ hidden: !medium.active }">
        <NuxtLink :to="`/medios/${medium.id}`" class="name">
          {{ plain(medium.name) }}
          <span v-if="!medium.active" class="tag">oculto</span>
        </NuxtLink>
        <span class="meta">
          {{ medium.stateName ?? 'Sin estado' }}
          &middot; {{ medium.noteCount }} nota(s)
          &middot; {{ medium.fileCount }} archivo(s)
          <template v-if="medium.themeCount"> &middot; {{ medium.themeCount }} tema(s)</template>
        </span>
        <button type="button" class="remove" :disabled="busy" @click="remove(medium)">
          Eliminar
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.bar { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
h1 { margin: 0; font-size: 1.35rem; }
.actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.link { color: var(--accent); text-decoration: none; font-weight: 600; padding: 0.55rem 0.25rem; }
.link:hover { text-decoration: underline; }

.counters { display: flex; gap: 1.5rem; flex-wrap: wrap; margin: 1.25rem 0; padding: 0; }
.counters div { display: flex; flex-direction: column; }
.counters dt { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
.counters dd { margin: 0; font-size: 1.4rem; font-weight: 600; }

.search { display: block; max-width: 24rem; margin-bottom: 1rem; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

.list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
.list li {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.25rem 1rem;
  align-items: center;
  padding: 0.75rem 0.9rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.list li.hidden { opacity: 0.6; }

.name { grid-column: 1; font-weight: 600; color: inherit; text-decoration: none; }
.name:hover { color: var(--accent); }
.meta { grid-column: 1; font-size: 0.85rem; color: var(--muted); }
.remove { grid-row: 1 / span 2; grid-column: 2; color: var(--danger); }

.tag {
  margin-left: 0.5rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: #ece9e2;
  color: var(--muted);
  font-weight: 700;
}
.muted { color: var(--muted); }
</style>
