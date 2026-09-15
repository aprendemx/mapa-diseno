<script setup lang="ts">
const { user, signOut } = useSession()
</script>

<template>
  <div class="shell">
    <header v-if="user">
      <strong>Mapa de México</strong>
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
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.85rem 1.25rem;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}

nav { display: flex; align-items: center; gap: 0.85rem; }
.who { color: var(--muted); font-size: 0.9rem; }
main { flex: 1; padding: 1.5rem 1.25rem; }
</style>
