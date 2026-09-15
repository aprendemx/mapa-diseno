<script setup lang="ts">
import type { MediumDetail } from '@mapa-mexico/postgres'
import type { SocialNetwork } from '@mapa-mexico/project-store'

type FileWitness = MediumDetail['files'][number] & { type: 'file' }
type ThemeWitness = MediumDetail['socialThemes'][number] & { type: 'theme' }
export type Witness = FileWitness | ThemeWitness

const props = defineProps<{
  files: MediumDetail['files']
  themes: MediumDetail['socialThemes']
  socialEnabled: boolean
}>()

const emit = defineEmits<{
  reorder: [ids: string[]]
  removeFile: [id: string]
  describeFile: [id: string, description: string]
  removeTheme: [index: number]
}>()

const NETWORKS: { key: SocialNetwork, label: string }[] = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'x', label: 'X (Twitter)' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' },
]

/**
 * Files and themes are one list, ordered against each other.
 *
 * Showing them in two separate boxes would be a lie about what the map
 * publishes: the reader sees a single sequence, and the position of a video
 * relative to a social theme is a real editorial decision.
 */
const witnesses = computed<Witness[]>(() => [
  ...props.files.map((file) => ({ ...file, type: 'file' as const })),
  ...props.themes.map((theme) => ({ ...theme, type: 'theme' as const })),
].sort((a, b) => a.position - b.position))

function move(index: number, by: number) {
  const ordered = witnesses.value.map((witness) => witness.id!).filter(Boolean)
  const to = index + by
  if (to < 0 || to >= ordered.length) return

  const [moved] = ordered.splice(index, 1)
  ordered.splice(to, 0, moved!)
  emit('reorder', ordered)
}

const themeIndex = (id: string | undefined) =>
  props.themes.findIndex((theme) => theme.id === id)

const previewUrl = (path: string) => `/${path}`
</script>

<template>
  <ol v-if="witnesses.length" class="witnesses">
    <li v-for="(witness, index) in witnesses" :key="witness.id ?? index">
      <div class="head">
        <span class="order">{{ index + 1 }}</span>

        <span v-if="witness.type === 'file'" class="kind">{{ witness.kind }}</span>
        <span v-else class="kind social" :class="{ muted: !socialEnabled }">redes</span>

        <span class="title">
          <template v-if="witness.type === 'file'">{{ witness.path.split('/').pop() }}</template>
          <template v-else>{{ witness.title || `Tema ${index + 1}` }}</template>
        </span>

        <span class="moves">
          <button type="button" :disabled="index === 0" @click="move(index, -1)">↑</button>
          <button
            type="button"
            :disabled="index === witnesses.length - 1"
            @click="move(index, 1)"
          >↓</button>
        </span>

        <button
          v-if="witness.type === 'file'"
          type="button"
          class="remove"
          @click="emit('removeFile', witness.id)"
        >Quitar</button>
        <button
          v-else
          type="button"
          class="remove"
          @click="emit('removeTheme', themeIndex(witness.id))"
        >Quitar</button>
      </div>

      <template v-if="witness.type === 'file'">
        <div class="preview">
          <video
            v-if="witness.kind === 'video'"
            :src="previewUrl(witness.path)"
            controls
            preload="metadata"
            playsinline
          />
          <audio
            v-else-if="witness.kind === 'audio'"
            :src="previewUrl(witness.path)"
            controls
            preload="metadata"
          />
          <img v-else :src="previewUrl(witness.path)" :alt="witness.description">
        </div>
        <input
          :value="witness.description"
          type="text"
          placeholder="Descripción opcional"
          @change="emit('describeFile', witness.id, ($event.target as HTMLInputElement).value)"
        >
      </template>

      <template v-else>
        <input v-model="witness.title" type="text" :placeholder="`Tema ${index + 1}`">
        <div class="links">
          <label v-for="network in NETWORKS" :key="network.key">
            <span>{{ network.label }}</span>
            <input v-model="witness.links[network.key]" type="url" placeholder="https://…">
          </label>
        </div>
      </template>
    </li>
  </ol>

  <p v-else class="empty">Todavía no hay testigos.</p>
</template>

<style scoped>
.witnesses { list-style: none; margin: 0.75rem 0 0; padding: 0; display: grid; gap: 0.75rem; counter-reset: witness; }
.witnesses li { border: 1px solid var(--line); border-radius: 6px; padding: 0.7rem 0.8rem; }

.head { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.order {
  font-variant-numeric: tabular-nums; font-weight: 700; color: var(--muted);
  min-width: 1.4rem; text-align: right;
}
.kind {
  font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;
  color: var(--muted); background: #eeeee7; border-radius: 4px; padding: 0.12rem 0.4rem;
}
.kind.social { background: #e4efe8; color: #2c6244; }
.kind.social.muted { background: #eeeee7; color: var(--muted); text-decoration: line-through; }

.title { flex: 1; font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.moves { display: flex; gap: 0.2rem; }
.moves button { padding: 0.2rem 0.5rem; line-height: 1; }
.remove { color: var(--danger); padding: 0.25rem 0.6rem; }

.preview { margin: 0.6rem 0; }
.preview video { max-width: 100%; max-height: 14rem; border-radius: 4px; background: #000; }
.preview audio { width: 100%; }
.preview img { max-width: 100%; max-height: 14rem; border-radius: 4px; }

input[type='text'], input[type='url'] {
  font: inherit; width: 100%; padding: 0.45rem 0.6rem;
  border: 1px solid var(--line); border-radius: 5px; background: var(--surface); color: inherit;
}

.links { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 0.45rem 0.8rem; margin-top: 0.5rem; }
.links label { font-size: 0.78rem; color: var(--muted); }
.links span { display: block; margin-bottom: 0.15rem; }

.empty { color: var(--muted); font-size: 0.9rem; margin: 0.75rem 0 0; }
</style>
