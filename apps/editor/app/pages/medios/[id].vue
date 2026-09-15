<script setup lang="ts">
import type { MediumDetail, StateOption } from '@mapa-mexico/postgres'
import type { Problem, SocialNetwork } from '@mapa-mexico/project-store'

const route = useRoute()
const id = route.params['id'] as string

const NETWORKS: { key: SocialNetwork, label: string }[] = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'x', label: 'X (Twitter)' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' },
]

const { data } = await useFetch<{ medium: MediumDetail }>(`/api/media/${id}`)
const { data: catalogue } = await useFetch<{ states: StateOption[] }>('/api/states')

const states = computed(() => catalogue.value?.states ?? [])
const form = reactive(structuredClone(toRaw(data.value!.medium)))

const problems = ref<Problem[]>([])
const saving = ref(false)
const saved = ref(false)

const problemFor = (field: string) => problems.value.find((p) => p.field === field)?.message

/** The map turns `[[…]]` into an emphasised place name inside the title. */
const noteCount = computed(() => form.notes.split(/\r?\n/).filter((line) => line.trim()).length)

function toggleCoverage(stateId: string, on: boolean) {
  const without = form.coverageStates.filter((s) => s !== stateId)
  form.coverageStates = on ? [...without, stateId] : without
}

function addTheme() {
  form.socialThemes.push({
    title: '',
    links: { instagram: '', facebook: '', x: '', tiktok: '', youtube: '' },
  })
}

async function save() {
  problems.value = []
  saved.value = false
  saving.value = true
  try {
    await $fetch(`/api/media/${id}`, { method: 'PUT', body: form })
    saved.value = true
  } catch (cause) {
    const data = (cause as { data?: { data?: { problems?: Problem[] } } })?.data?.data
    problems.value = data?.problems ?? [
      { field: '', message: 'No se pudo guardar. Intentá de nuevo.' },
    ]
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="editor">
    <NuxtLink to="/" class="back">&larr; Medios</NuxtLink>

    <form @submit.prevent="save">
      <fieldset>
        <legend>Identidad</legend>

        <label for="name">Nombre del medio</label>
        <input id="name" v-model="form.name" type="text" required>
        <p class="hint">
          Lo que escribas entre <code>[[ ]]</code> se resalta como nombre de lugar en el mapa.
        </p>
        <p v-if="problemFor('name')" class="problem">{{ problemFor('name') }}</p>

        <label for="state">Estado de origen</label>
        <select id="state" v-model="form.stateId">
          <option :value="null">Sin estado asignado</option>
          <option v-for="state in states" :key="state.id" :value="state.id">{{ state.name }}</option>
        </select>

        <label class="check">
          <input v-model="form.active" type="checkbox">
          Visible en el mapa
        </label>
        <p class="hint">
          Un medio oculto conserva sus datos y sus archivos; solo deja de aparecer.
        </p>
      </fieldset>

      <fieldset>
        <legend>Notas <span class="count">{{ noteCount }}</span></legend>
        <label for="notes">Una por línea</label>
        <textarea id="notes" v-model="form.notes" rows="6" />
        <p class="hint">Cada línea no vacía se publica como una nota independiente.</p>
      </fieldset>

      <fieldset>
        <legend>
          Cobertura
          <span class="count">{{ form.coverageStates.length }}</span>
        </legend>

        <label for="coverage-text">Texto desplegable</label>
        <textarea id="coverage-text" v-model="form.coverageText" rows="2" />

        <p class="hint">Estados adicionales que alcanza, además del de origen.</p>
        <p v-if="problemFor('coverageStates')" class="problem">{{ problemFor('coverageStates') }}</p>

        <ul class="states">
          <li v-for="state in states" :key="state.id">
            <label :class="{ disabled: state.id === form.stateId }">
              <input
                type="checkbox"
                :checked="form.coverageStates.includes(state.id)"
                :disabled="state.id === form.stateId"
                @change="toggleCoverage(state.id, ($event.target as HTMLInputElement).checked)"
              >
              {{ state.name }}
            </label>
          </li>
        </ul>
      </fieldset>

      <fieldset>
        <legend>Redes sociales</legend>

        <label class="check">
          <input v-model="form.socialEnabled" type="checkbox">
          Publicar temas de redes en el mapa
        </label>
        <p class="hint">
          Con esto apagado los temas se conservan acá, pero no se publican.
        </p>

        <div v-for="(theme, index) in form.socialThemes" :key="index" class="theme">
          <div class="theme-head">
            <input v-model="theme.title" type="text" :placeholder="`Tema ${index + 1}`">
            <button type="button" @click="form.socialThemes.splice(index, 1)">Quitar</button>
          </div>
          <div class="links">
            <label v-for="network in NETWORKS" :key="network.key">
              <span>{{ network.label }}</span>
              <input v-model="theme.links[network.key]" type="url" placeholder="https://…">
              <em v-if="problemFor(`socialThemes.${index}.links.${network.key}`)" class="problem">
                {{ problemFor(`socialThemes.${index}.links.${network.key}`) }}
              </em>
            </label>
          </div>
        </div>

        <button type="button" @click="addTheme">+ Agregar tema</button>
      </fieldset>

      <fieldset>
        <legend>Archivos <span class="count">{{ form.files.length }}</span></legend>
        <p v-if="form.files.length === 0" class="hint">Todavía no hay archivos.</p>
        <ul v-else class="files">
          <li v-for="file in form.files" :key="file.id">
            <span class="kind">{{ file.kind }}</span>
            <span class="path">{{ file.path.split('/').pop() }}</span>
            <span v-if="file.description" class="muted">{{ file.description }}</span>
          </li>
        </ul>
        <p class="hint">Subir y reordenar archivos llega en el siguiente tramo.</p>
      </fieldset>

      <div class="foot">
        <button type="submit" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
        <span v-if="saved" class="ok" role="status">Guardado.</span>
        <span v-if="problemFor('')" class="problem">{{ problemFor('') }}</span>
      </div>
    </form>
  </section>
</template>

<style scoped>
.editor { max-width: 54rem; }
.back { display: inline-block; margin-bottom: 1rem; color: var(--muted); text-decoration: none; }
.back:hover { color: var(--accent); }

fieldset {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  padding: 1rem 1.15rem 1.25rem;
  margin: 0 0 1rem;
}

legend { font-weight: 700; padding: 0 0.4rem; }
.count {
  margin-left: 0.4rem; font-weight: 600; font-size: 0.8rem;
  color: var(--muted); background: #eeeee7; border-radius: 10px; padding: 0.05rem 0.45rem;
}

label { display: block; font-size: 0.85rem; color: var(--muted); margin: 0.85rem 0 0.25rem; }
label.check { display: flex; align-items: center; gap: 0.5rem; color: inherit; font-size: 0.95rem; }
label.check input { width: auto; }

select, textarea {
  font: inherit; width: 100%; padding: 0.55rem 0.7rem;
  border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: inherit;
}
textarea { resize: vertical; }

.hint { margin: 0.35rem 0 0; font-size: 0.8rem; color: var(--muted); }
.hint code { background: #eeeee7; padding: 0 0.25rem; border-radius: 3px; }

.problem { margin: 0.35rem 0 0; font-size: 0.82rem; color: var(--danger); font-style: normal; }
.ok { color: var(--accent); font-weight: 600; font-size: 0.9rem; }

.states {
  list-style: none; margin: 0.75rem 0 0; padding: 0;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.15rem 0.75rem;
}
.states label { display: flex; align-items: center; gap: 0.4rem; margin: 0; color: inherit; font-size: 0.9rem; }
.states label.disabled { opacity: 0.45; }
.states input { width: auto; }

.theme { border: 1px solid var(--line); border-radius: 6px; padding: 0.75rem; margin: 0.85rem 0; }
.theme-head { display: flex; gap: 0.5rem; }
.links { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 0.5rem 0.9rem; margin-top: 0.6rem; }
.links label { margin: 0; }
.links span { display: block; margin-bottom: 0.2rem; }

.files { list-style: none; padding: 0; margin: 0.5rem 0 0; display: grid; gap: 0.3rem; }
.files li { display: flex; gap: 0.6rem; align-items: baseline; font-size: 0.9rem; }
.kind {
  font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700;
  color: var(--muted); background: #eeeee7; border-radius: 4px; padding: 0.1rem 0.4rem;
}
.path { font-family: ui-monospace, monospace; font-size: 0.85rem; }
.muted { color: var(--muted); }

.foot { display: flex; align-items: center; gap: 1rem; }
</style>
