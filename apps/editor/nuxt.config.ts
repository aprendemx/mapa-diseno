export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: true },

  runtimeConfig: {
    // Server-only. Overridden by NUXT_DATABASE_URL in every real environment.
    databaseUrl: '',
    // Cookies are marked Secure unless this says otherwise, so a
    // misconfiguration fails closed rather than sending them in the clear.
    insecureCookies: '',
  },

  nitro: {
    // The published map is static and served by nginx; this app only edits it.
    preset: 'node-server',
  },

  typescript: { strict: true, typeCheck: false },
})
