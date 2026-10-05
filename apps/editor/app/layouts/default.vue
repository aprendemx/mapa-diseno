<script setup lang="ts">
import type { MapRow } from '@mapa-mexico/project-store'

const { user, signOut } = useSession()
const route = useRoute()

const slug = computed(() => String(route.params['slug'] ?? ''))

/**
 * El mapa actual, siempre visible en la barra.
 *
 * No es decoración: con varios mapas, editar el equivocado es un error fácil de
 * cometer y difícil de notar. Que el nombre esté arriba y la ruta en la URL
 * hace que no haya que adivinarlo.
 */
// La barra se dibuja también en /login, donde no hay sesión: pedir la lista
// ahí daría un 401 en cada carga. Se pide cuando hay usuario y hay mapa.
const { data, refresh } = await useFetch<{ maps: MapRow[] }>('/api/maps', {
  immediate: false,
  default: () => ({ maps: [] }),
})

watch(
  [user, slug],
  ([current, where]) => { if (current && where && data.value.maps.length === 0) refresh() },
  { immediate: true },
)

const currentName = computed(() =>
  data.value.maps.find((map) => map.slug === slug.value)?.name ?? slug.value,
)
</script>

<template>
  <div class="shell">
    <header v-if="user">
      <NuxtLink to="/" class="home">Mapas</NuxtLink>
      <span v-if="slug" class="here">
        <span class="sep">/</span>
        <strong>{{ currentName }}</strong>
        <code>/{{ slug }}</code>
      </span>
      <nav>
        <span class="who">{{ user.name }}</span>
        <button type="button" @click="signOut">Cerrar sesión</button>
      </nav>
    </header>
    <main>
      <slot />
    </main>
  </div>
</template>

<style scoped>
.shell { min-height: 100vh; display: flex; flex-direction: column; }

header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  padding: 0.85rem 1.25rem;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}

.home { font-weight: 700; color: inherit; text-decoration: none; }
.home:hover { color: var(--accent); }

.here { display: flex; align-items: center; gap: 0.5rem; }
.sep { color: var(--line); }
.here code { font-size: 0.78rem; color: var(--muted); }

nav { margin-left: auto; display: flex; align-items: center; gap: 0.85rem; }
.who { color: var(--muted); font-size: 0.9rem; }
main { flex: 1; padding: 1.5rem 1.25rem; }
</style>
