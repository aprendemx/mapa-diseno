<script setup lang="ts">
const { signIn } = useSession()

const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await signIn(email.value, password.value)
    await navigateTo('/')
  } catch (cause) {
    // The server deliberately says the same thing for an unknown email and a
    // wrong password. Do not try to be more helpful here than it was there.
    error.value =
      (cause as { statusMessage?: string })?.statusMessage ??
      'No se pudo iniciar sesión. Intenta de nuevo.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="login">
    <form @submit.prevent="submit">
      <h1>Editor del mapa</h1>

      <label for="email">Correo</label>
      <input id="email" v-model="email" type="email" autocomplete="username" required autofocus>

      <label for="password">Contraseña</label>
      <input
        id="password"
        v-model="password"
        type="password"
        autocomplete="current-password"
        required
      >

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <button type="submit" :disabled="busy">
        {{ busy ? 'Entrando…' : 'Entrar' }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.login { display: grid; place-items: center; min-height: 80vh; padding: 1rem; }

form {
  width: min(24rem, 100%);
  display: grid;
  gap: 0.4rem;
  padding: 1.75rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
}

h1 { margin: 0 0 0.75rem; font-size: 1.25rem; }
label { font-size: 0.85rem; color: var(--muted); margin-top: 0.5rem; }
button { margin-top: 1.25rem; }

.error {
  margin: 0.75rem 0 0;
  padding: 0.55rem 0.7rem;
  border-radius: 6px;
  background: #fbecea;
  color: var(--danger);
  font-size: 0.9rem;
}
</style>
