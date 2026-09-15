/**
 * Keeps unauthenticated visitors on the login page.
 *
 * This is a convenience for the browser, not a security boundary — every
 * endpoint that matters calls `requireUser` on the server. Route middleware
 * runs on the client too, where it can simply be skipped.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, refresh } = useSession()

  if (user.value === null) {
    await refresh()
  }

  if (!user.value && to.path !== '/login') {
    return navigateTo('/login')
  }

  if (user.value && to.path === '/login') {
    return navigateTo('/')
  }
})
