import type { SessionUser } from '@mapa-mexico/postgres'

/**
 * The signed-in user, resolved once on the server and reused on the client.
 *
 * `useState` rather than a plain ref: the value is serialised into the page,
 * so the first client render already knows who is signed in and the layout
 * does not flash a logged-out shell.
 */
export function useSession() {
  const user = useState<SessionUser | null>('session-user', () => null)

  /**
   * Resuelve quién está en sesión.
   *
   * `useRequestFetch` y no `$fetch`: durante el render del servidor, `$fetch` no
   * reenvía la cookie de la petición entrante, así que el servidor no veía
   * sesión y el middleware mandaba al login. En el navegador se recuperaba al
   * hidratar, pero cualquiera que refrescara una página o abriera un enlace
   * directo veía ese salto.
   */
  async function refresh(): Promise<void> {
    const pedir = useRequestFetch()
    const { user: current } = await pedir<{ user: SessionUser | null }>('/api/auth/me')
    user.value = current
  }

  async function signIn(email: string, password: string): Promise<void> {
    const { user: signedIn } = await $fetch<{ user: SessionUser }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    user.value = signedIn
  }

  async function signOut(): Promise<void> {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
    await navigateTo('/login')
  }

  return { user, refresh, signIn, signOut }
}
