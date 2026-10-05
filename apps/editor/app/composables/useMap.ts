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

  /** `/api/maps/<slug>/<resto>` */
  const api = (path = '') => `/api/maps/${slug.value}${path}`

  /** `/admin/<slug>/<resto>`, para los enlaces internos. */
  const link = (path = '') => `/${slug.value}${path}`

  return { slug, api, link }
}

/** La lista de mapas, cargada una vez y compartida. */
export function useMaps() {
  return useState<MapRow[]>('maps', () => [])
}
