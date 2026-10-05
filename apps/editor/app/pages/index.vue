<script setup lang="ts">
import type { MapRow } from '@mapa-mexico/project-store'

const { data, refresh } = await useFetch<{ maps: MapRow[] }>('/api/maps')

const maps = computed(() => data.value?.maps ?? [])
const creating = ref(false)
const busy = ref(false)
const error = ref('')

const nuevo = reactive({ name: '', slug: '' })

/** El slug se propone desde el nombre, pero se puede corregir antes de crear. */
const sugerir = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

watch(() => nuevo.name, (name) => { nuevo.slug = sugerir(name) })

async function crear() {
  error.value = ''
  busy.value = true
  try {
    const { map } = await $fetch<{ map: MapRow }>('/api/maps', {
      method: 'POST',
      body: { name: nuevo.name, slug: nuevo.slug },
    })
    await navigateTo(`/${map.slug}`)
  } catch (cause) {
    error.value = (cause as { statusMessage?: string })?.statusMessage
      ?? 'No se pudo crear el mapa.'
  } finally {
    busy.value = false
  }
}

async function hacerPredeterminado(map: MapRow) {
  if (!confirm(`¿Servir "${map.name}" en la raíz del dominio?\n\nLos dos mapas siguen accesibles por su ruta; solo cambia cuál aparece en la portada.`)) return
  busy.value = true
  try {
    await $fetch(`/api/maps/${map.slug}/default`, { method: 'POST' })
    await refresh()
  } finally {
    busy.value = false
  }
}

async function borrar(map: MapRow) {
  if (!confirm(`¿Eliminar el mapa "${map.name}"?\n\nSe borra su catálogo, su apariencia y su historial.\nLos archivos en sitio/${map.slug}/ NO se borran.`)) return
  busy.value = true
  error.value = ''
  try {
    await $fetch(`/api/maps/${map.slug}`, { method: 'DELETE' })
    await refresh()
  } catch (cause) {
    error.value = (cause as { statusMessage?: string })?.statusMessage ?? 'No se pudo eliminar.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="maps">
    <div class="bar">
      <h1>Mapas</h1>
      <button type="button" :disabled="busy" @click="creating = !creating">
        {{ creating ? 'Cancelar' : '+ Nuevo mapa' }}
      </button>
    </div>

    <form v-if="creating" class="nuevo" @submit.prevent="crear">
      <label for="map-name">Nombre</label>
      <input id="map-name" v-model="nuevo.name" type="text" placeholder="Telesecundarias" required autofocus>

      <label for="map-slug">Ruta pública</label>
      <div class="slug">
        <span>mapa.aprende.gob.mx/</span>
        <input id="map-slug" v-model="nuevo.slug" type="text" required>
      </div>
      <p class="hint">
        No se puede cambiar después sin romper los enlaces que ya se hayan compartido.
      </p>

      <button type="submit" :disabled="busy">{{ busy ? 'Creando…' : 'Crear mapa' }}</button>
    </form>

    <p v-if="error" class="problem" role="alert">{{ error }}</p>

    <ul class="list">
      <li v-for="map in maps" :key="map.id">
        <NuxtLink :to="`/${map.slug}`" class="name">
          {{ map.name }}
          <span v-if="map.is_default" class="tag">en la raíz</span>
        </NuxtLink>
        <span class="route">/{{ map.slug }}</span>
        <span class="actions">
          <button
            v-if="!map.is_default"
            type="button"
            :disabled="busy"
            @click="hacerPredeterminado(map)"
          >Pasar a la raíz</button>
          <button
            v-if="!map.is_default && maps.length > 1"
            type="button"
            class="remove"
            :disabled="busy"
            @click="borrar(map)"
          >Eliminar</button>
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.maps { max-width: 46rem; }
.bar { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
h1 { margin: 0 0 1rem; font-size: 1.35rem; }

.nuevo {
  display: grid; gap: 0.3rem; margin-bottom: 1.25rem;
  padding: 1rem 1.15rem 1.25rem; background: var(--surface);
  border: 1px solid var(--line); border-radius: 8px;
}
.nuevo label { font-size: 0.85rem; color: var(--muted); margin-top: 0.5rem; }
.nuevo button { margin-top: 1rem; justify-self: start; background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }

.slug { display: flex; align-items: center; gap: 0.3rem; }
.slug span { font-size: 0.85rem; color: var(--muted); white-space: nowrap; }
.hint { margin: 0.35rem 0 0; font-size: 0.8rem; color: var(--muted); }
.problem { color: var(--danger); font-size: 0.88rem; }

.list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
.list li {
  display: grid; grid-template-columns: 1fr auto; gap: 0.2rem 1rem; align-items: center;
  padding: 0.8rem 0.95rem; background: var(--surface);
  border: 1px solid var(--line); border-radius: 8px;
}
.name { grid-column: 1; font-weight: 600; font-size: 1.02rem; color: inherit; text-decoration: none; }
.name:hover { color: var(--accent); }
.route { grid-column: 1; font-family: ui-monospace, monospace; font-size: 0.82rem; color: var(--muted); }
.actions { grid-row: 1 / span 2; grid-column: 2; display: flex; gap: 0.4rem; }
.remove { color: var(--danger); }

.tag {
  margin-left: 0.5rem; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em;
  font-weight: 700; color: var(--accent); background: #e4efe8;
  border-radius: 4px; padding: 0.15rem 0.45rem;
}
</style>
