export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: true },

  runtimeConfig: {
    // Server-only. Overridden by NUXT_DATABASE_URL in every real environment.
    databaseUrl: '',
    // Cookies are marked Secure unless this says otherwise, so a
    // misconfiguration fails closed rather than sending them in the clear.
    insecureCookies: '',
    // Where `contenidos/` lives. In production this is the same directory
    // nginx serves the published map from.
    mediaRoot: '../..',
    maxUploadBytes: String(2 * 1024 * 1024 * 1024),
    // The template the published page is built from, and where it lands.
    // In production `publishDir` is the directory nginx serves.
    templatePath: '../../mapa-base.html',
    publishDir: '../../publicado',
  },

  nitro: {
    // The published map is static and served by nginx; this app only edits it.
    preset: 'node-server',
    // Serves media for previews inside the editor. These are the same bytes
    // nginx already serves publicly, so nothing new is exposed by it.
    publicAssets: [{ dir: '../../contenidos', baseURL: '/contenidos', maxAge: 0 }],
  },

  typescript: { strict: true, typeCheck: false },
})
