export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',

  // El editor se sirve bajo /admin del mismo dominio que los mapas, asi que
  // Traefik enruta por path y no hace falta un dominio ni un certificado mas.
  // Traefik NO recorta el prefijo: llega entero y Nuxt lo espera entero.
  app: { baseURL: '/admin/' },

  devtools: { enabled: true },

  runtimeConfig: {
    // Server-only. Overridden by NUXT_DATABASE_URL in every real environment.
    databaseUrl: '',
    // Cookies are marked Secure unless this says otherwise, so a
    // misconfiguration fails closed rather than sending them in the clear.
    insecureCookies: '',
    // La raiz del arbol que sirve nginx. Dentro hay un directorio por mapa, y
    // en la raiz dos enlaces simbolicos al mapa predeterminado.
    siteRoot: '../../sitio',
    maxUploadBytes: String(2 * 1024 * 1024 * 1024),
    // La plantilla desde la que se construye la pagina publicada.
    templatePath: '../../mapa-base.html',
  },

  nitro: {
    // The published map is static and served by nginx; this app only edits it.
    preset: 'node-server',
    // Serves media for previews inside the editor. These are the same bytes
    // nginx already serves publicly, so nothing new is exposed by it.
  },

  typescript: { strict: true, typeCheck: false },
})
