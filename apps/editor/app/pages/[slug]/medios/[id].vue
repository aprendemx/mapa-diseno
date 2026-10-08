<script setup lang="ts">
import type { MediumDetail, StateOption } from '@mapa-mexico/postgres'
import type { Problem } from '@mapa-mexico/project-store'

const route = useRoute()
const id = route.params['id'] as string
const { api, asset, link } = useMap()

const { data, refresh } = await useFetch<{ medium: MediumDetail }>(() => api(`/media/${id}`))
const { data: catalogue } = await useFetch<{ states: StateOption[] }>('/api/states')

const states = computed(() => catalogue.value?.states ?? [])
const form = reactive(structuredClone(toRaw(data.value!.medium)))

const problems = ref<Problem[]>([])
const notice = ref('')
const saving = ref(false)
const saved = ref(false)

const problemFor = (field: string) => problems.value.find((p) => p.field === field)?.message
const noteCount = computed(() => form.notes.split(/\r?\n/).filter((line) => line.trim()).length)

/**
 * Trae el medio entero del servidor. Solo después de guardar.
 *
 * Ahí sí corresponde pisar el formulario: lo que tiene la base es exactamente
 * lo que se acaba de escribir, más lo que el servidor normalizó y los ids que
 * les dio a los temas nuevos.
 */
async function reload() {
  await refresh()
  Object.assign(form, structuredClone(toRaw(data.value!.medium)))
}

/**
 * Trae únicamente lo que el servidor cambió por su cuenta.
 *
 * Subir, quitar y reordenar testigos escriben en la base sin pasar por Guardar,
 * así que la lista de archivos del formulario queda vieja y hay que refrescarla.
 * Pero hacerlo con `reload()` se llevaba puesto todo lo que la persona estaba
 * editando y todavía no había guardado: cambiabas el nombre de un medio, subías
 * un video, y al guardar el nombre volvía al anterior.
 *
 * Lo que confunde al reportarlo es que parece un fallo de Guardar, y no lo es:
 * los cambios se perdían **al subir**, y Guardar escribía fielmente lo que para
 * entonces quedaba en el formulario. Por eso volver a aplicarlos sin subir nada
 * funcionaba.
 *
 * Los archivos se pueden reemplazar enteros porque el guardado ni los mira
 * —`readMediumInput` no lee `files`—, así que en el formulario son solo para
 * mostrar.
 */
async function reloadWitnesses() {
  await refresh()
  const fresh = data.value!.medium

  form.files = structuredClone(toRaw(fresh.files))

  // Reordenar reescribe las posiciones de los archivos *y* de los temas, asi
  // que las de los temas tambien hay que traerlas. Por id y sin reemplazar la
  // lista: un tema recien agregado no tiene fila todavia, y reemplazarla lo
  // borraria antes de que llegue a guardarse.
  for (const theme of form.socialThemes) {
    if (!theme.id) continue
    const saved = fresh.socialThemes.find((other) => other.id === theme.id)
    if (saved) theme.position = saved.position
  }
}

function toggleCoverage(stateId: string, on: boolean) {
  const without = form.coverageStates.filter((s) => s !== stateId)
  form.coverageStates = on ? [...without, stateId] : without
}

function addTheme() {
  form.socialThemes.push({
    title: '',
    position: Number.MAX_SAFE_INTEGER,
    links: { instagram: '', facebook: '', x: '', tiktok: '', youtube: '' },
  })
  notice.value = 'El tema nuevo se coloca al final de los testigos al guardar.'
}

async function reorder(ids: string[]) {
  await $fetch(api(`/media/${id}/witness-order`), { method: 'PUT', body: { ids } })
  await reloadWitnesses()
}

async function removeFile(fileId: string) {
  if (!confirm('¿Quitar este archivo del medio?\n\nEl archivo NO se borra del disco.')) return
  await $fetch(api(`/media/${id}/files/${fileId}`), { method: 'DELETE' })
  await reloadWitnesses()
}

async function describeFile(fileId: string, description: string) {
  await $fetch(api(`/media/${id}/files/${fileId}`), { method: 'PATCH', body: { description } })
}

async function save() {
  problems.value = []
  notice.value = ''
  saved.value = false
  saving.value = true
  try {
    await $fetch(api(`/media/${id}`), { method: 'PUT', body: form })
    await reload()
    saved.value = true
  } catch (cause) {
    const payload = (cause as { data?: { data?: { problems?: Problem[] } } })?.data?.data
    problems.value = payload?.problems ?? [
      { field: '', message: apiMessage(cause, 'No se pudo guardar. Intenta de nuevo.') },
    ]
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="editor">
    <NuxtLink :to="link()" class="back">&larr; Medios</NuxtLink>

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
        <p class="hint">Un medio oculto conserva sus datos y sus archivos; solo deja de aparecer.</p>
      </fieldset>

      <fieldset>
        <legend>Notas <span class="count">{{ noteCount }}</span></legend>
        <label for="notes">Una por línea</label>
        <textarea id="notes" v-model="form.notes" rows="6" />
        <p class="hint">Cada línea no vacía se publica como una nota independiente.</p>
      </fieldset>

      <fieldset>
        <legend>Cobertura <span class="count">{{ form.coverageStates.length }}</span></legend>

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
        <legend>
          Testigos
          <span class="count">{{ form.files.length + form.socialThemes.length }}</span>
        </legend>

        <FileUploader
          :medium-id="id"
          :asset="asset"
          @uploaded="reloadWitnesses"
          @error="(message) => (problems = [{ field: '', message }])"
        />

        <label class="check">
          <input v-model="form.socialEnabled" type="checkbox">
          Publicar los temas de redes en el mapa
        </label>
        <p class="hint">Con esto apagado los temas se conservan aquí, pero no se publican.</p>

        <WitnessList
          :api="api"
          :asset="asset"
          :files="form.files"
          :themes="form.socialThemes"
          :social-enabled="form.socialEnabled"
          @reorder="reorder"
          @remove-file="removeFile"
          @describe-file="describeFile"
          @remove-theme="(index) => form.socialThemes.splice(index, 1)"
        />

        <button type="button" class="add" @click="addTheme">+ Agregar tema de redes</button>

        <p v-for="problem in problems.filter((p) => p.field.startsWith('socialThemes'))"
           :key="problem.field" class="problem">
          {{ problem.message }}
        </p>
      </fieldset>

      <div class="foot">
        <button type="submit" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
        <span v-if="saved" class="ok" role="status">Guardado.</span>
        <span v-if="notice" class="notice" role="status">{{ notice }}</span>
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
  border: 1px solid var(--line); border-radius: 8px; background: var(--surface);
  padding: 1rem 1.15rem 1.25rem; margin: 0 0 1rem;
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

.problem { margin: 0.35rem 0 0; font-size: 0.82rem; color: var(--danger); }
.ok { color: var(--accent); font-weight: 600; font-size: 0.9rem; }
.notice { color: var(--muted); font-size: 0.85rem; }

.states {
  list-style: none; margin: 0.75rem 0 0; padding: 0;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.15rem 0.75rem;
}
.states label { display: flex; align-items: center; gap: 0.4rem; margin: 0; color: inherit; font-size: 0.9rem; }
.states label.disabled { opacity: 0.45; }
.states input { width: auto; }

.add { margin-top: 0.85rem; }
.foot { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
</style>
