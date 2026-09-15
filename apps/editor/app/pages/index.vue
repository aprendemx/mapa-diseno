<script setup lang="ts">
const { user } = useSession()
</script>

<template>
  <section>
    <h1>Hola, {{ user?.name }}</h1>
    <p class="muted">
      La autenticación está lista. Las pantallas de edición del catálogo llegan
      en el siguiente tramo.
    </p>
  </section>
</template>

<style scoped>
h1 { margin-top: 0; font-size: 1.35rem; }
.muted { color: var(--muted); max-width: 42rem; }
</style>
