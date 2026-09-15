import type { SessionUser } from '@mapa-mexico/postgres'

/** Who the browser is, as far as the server is concerned. Null when nobody. */
export default defineEventHandler((event) => {
  return { user: (event.context.user as SessionUser | undefined) ?? null }
})
