import type { MapRow } from '@mapa-mexico/project-store'

/**
 * El mapa de la ruta actual, y las URL del API acotadas a él.
 *
 * Un solo lugar construye esas URL. Si cada pantalla armara la suya, la que se
 * olvidara el slug no fallaría — operaría sobre otro mapa, que es exactamente
 * la clase de error que el aislamiento del adaptador existe para cerrar.
 */
export function useMap() {
  const route = useRoute()
  const slug = computed(() => String(route.params['slug'] ?? ''))

  /**
   * `/api/maps/<slug>/<resto>`, para `$fetch`.
   *
   * Sin el prefijo de la app: el `$fetch` de Nuxt lo antepone solo.
   */
  const api = (path = '') => `/api/maps/${slug.value}${path}`

  /**
   * La misma ruta, pero absoluta y con el prefijo de la app.
   *
   * Es para los atributos `src` de `<video>`, `<audio>` e `<img>`: esos son
   * peticiones crudas del navegador, no pasan por `$fetch` y por lo tanto nadie
   * les agrega el prefijo. Con el editor servido en `/admin`, una URL sin él se
   * va a la raíz del dominio, donde nginx no conoce la ruta y responde 404.
   */
  const asset = (path = '') => {
    const base = useRuntimeConfig().app.baseURL.replace(/\/$/, '')
    return `${base}${api(path)}`
  }

  /** `/admin/<slug>/<resto>`, para los enlaces internos. */
  const link = (path = '') => `/${slug.value}${path}`

  return { slug, api, asset, link }
}

/** La lista de mapas, cargada una vez y compartida. */
export function useMaps() {
  return useState<MapRow[]>('maps', () => [])
}
