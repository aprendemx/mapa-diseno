<script setup lang="ts">
import type { Appearance } from '@mapa-mexico/map-generator'
import type { Problem } from '@mapa-mexico/project-store'

const COLOURS: { key: keyof Appearance, label: string }[] = [
  { key: 'backgroundColor', label: 'Fondo' },
  { key: 'titleColor', label: 'Títulos' },
  { key: 'stateWithMediaColor', label: 'Estado con medios' },
  { key: 'stateDisabledColor', label: 'Estado sin medios' },
  { key: 'stateHoverColor', label: 'Estado al pasar el cursor' },
  { key: 'stateSelectedColor', label: 'Estado seleccionado' },
  { key: 'coverageOriginColor', label: 'Origen de cobertura' },
  { key: 'coverageAreaColor', label: 'Área de cobertura' },
  { key: 'glowColor', label: 'Resplandor' },
  { key: 'accentColor', label: 'Acento' },
]

const SLIDERS: { key: keyof Appearance, label: string, min: number, max: number, step: number }[] = [
  { key: 'glowIntensity', label: 'Intensidad del resplandor', min: 0, max: 30, step: 1 },
  { key: 'glowOpacity', label: 'Opacidad del resplandor', min: 0, max: 100, step: 1 },
  { key: 'glowCoreSize', label: 'Núcleo del resplandor', min: 0, max: 10, step: 0.5 },
  { key: 'glowSpread', label: 'Difusión del resplandor', min: 0, max: 30, step: 0.5 },
  { key: 'glowOutline', label: 'Contorno', min: 0, max: 5, step: 0.1 },
]

const { api, link } = useMap()
const { data } = await useFetch<{ appearance: Appearance }>(() => api('/appearance'))
const form = reactive(structuredClone(toRaw(data.value!.appearance)))

const problems = ref<Problem[]>([])
const saving = ref(false)
const saved = ref(false)

const problemFor = (field: string) => problems.value.find((p) => p.field === field)?.message

async function save() {
  problems.value = []
  saved.value = false
  saving.value = true
  try {
    await $fetch(api('/appearance'), { method: 'PUT', body: form })
    saved.value = true
  } catch (cause) {
    const payload = (cause as { data?: { data?: { problems?: Problem[] } } })?.data?.data
    problems.value = payload?.problems ?? [
      { field: '', message: 'No se pudo guardar. Intentá de nuevo.' },
    ]
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="appearance">
    <NuxtLink :to="link()" class="back">&larr; Medios</NuxtLink>
    <h1>Apariencia del mapa</h1>
    <p class="hint">
      Estos valores se aplican cuando se publica el mapa, no al guardarlos acá.
    </p>

    <form @submit.prevent="save">
      <fieldset>
        <legend>Colores</legend>
        <div class="grid">
          <label v-for="colour in COLOURS" :key="colour.key">
            <span>{{ colour.label }}</span>
            <span class="swatch">
              <input v-model="form[colour.key] as string" type="color">
              <code>{{ form[colour.key] }}</code>
            </span>
            <em v-if="problemFor(colour.key)" class="problem">{{ problemFor(colour.key) }}</em>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Resplandor</legend>
        <label v-for="slider in SLIDERS" :key="slider.key" class="slider">
          <span>{{ slider.label }}</span>
          <input
            v-model.number="form[slider.key] as number"
            type="range"
            :min="slider.min"
            :max="slider.max"
            :step="slider.step"
          >
          <output>{{ form[slider.key] }}</output>
          <em v-if="problemFor(slider.key)" class="problem">{{ problemFor(slider.key) }}</em>
        </label>
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
.appearance { max-width: 48rem; }
.back { display: inline-block; margin-bottom: 1rem; color: var(--muted); text-decoration: none; }
.back:hover { color: var(--accent); }
h1 { margin: 0 0 0.25rem; font-size: 1.35rem; }
.hint { margin: 0 0 1.25rem; color: var(--muted); font-size: 0.9rem; }

fieldset {
  border: 1px solid var(--line); border-radius: 8px; background: var(--surface);
  padding: 1rem 1.15rem 1.25rem; margin: 0 0 1rem;
}
legend { font-weight: 700; padding: 0 0.4rem; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: 0.9rem; }
label { display: block; font-size: 0.85rem; color: var(--muted); }
label > span { display: block; margin-bottom: 0.3rem; }

.swatch { display: flex; align-items: center; gap: 0.5rem; }
.swatch input { width: 2.6rem; height: 2.1rem; padding: 0.15rem; }
.swatch code { font-size: 0.8rem; color: var(--ink); }

.slider { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 0.5rem 0.75rem; margin-bottom: 0.9rem; }
.slider > span { grid-column: 1 / -1; margin: 0; }
.slider input[type='range'] { width: 100%; padding: 0; }
.slider output { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--ink); min-width: 2.5rem; text-align: right; }

.problem { display: block; margin-top: 0.3rem; font-size: 0.82rem; color: var(--danger); font-style: normal; }
.ok { color: var(--accent); font-weight: 600; font-size: 0.9rem; }
.foot { display: flex; align-items: center; gap: 1rem; }
</style>
