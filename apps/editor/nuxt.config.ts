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
    // Tamaño del trozo en una subida. Lo decide el servidor porque el límite
    // que esquiva es del camino de red y no del archivo: Traefik deja de leer
    // un cuerpo a los 60 s por omisión y Cloudflare rechaza cualquiera de más
    // de 100 MB. Con 4 MiB un trozo tarda unos 34 s incluso a 1 Mbps de
    // subida, así que el editor funciona sin depender de la configuración de
    // una infraestructura que no está a su alcance.
    uploadChunkBytes: String(4 * 1024 * 1024),
    // La plantilla desde la que se construye la pagina publicada.
    templatePath: '../../mapa-base.html',
  },

  nitro: {
    // The published map is static and served by nginx; this app only edits it.
    preset: 'node-server',
    // Serves media for previews inside the editor. These are the same bytes
    // nginx already serves publicly, so nothing new is exposed by it.
  },

  // Nuxt precarga la carga util de cada enlace en cuanto entra en pantalla.
  // Detras de Cloudflare esas peticiones no pueden resolver el desafio de bots
  // --igual que curl, que recibe 403-- asi que fallan siempre y aparecen como
  // 503 en el inspector. No rompen nada, porque al hacer clic la navegacion si
  // lleva la cookie del desafio; son trafico que nunca sirve de nada.
  //
  // Con 3 personas y un catalogo de 32 medios, lo que ahorraria la precarga no
  // se nota. El ruido al depurar, si.
  experimental: {
    defaults: { nuxtLink: { prefetch: false } },
  },

  typescript: { strict: true, typeCheck: false },
})
