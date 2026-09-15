import { hashSessionToken, issueSession, shouldRenew } from '@mapa-mexico/auth'
import { findSessionUser, renewSession } from '@mapa-mexico/postgres'

/**
 * Resolves the session cookie on every request and hangs the user off the
 * event. Routes read `event.context.user`; nothing else touches the cookie.
 *
 * This only ever *populates* the context. Deciding whether a missing user is
 * acceptable belongs to each route — a global redirect here would silently
 * protect endpoints that nobody remembered to think about, which is how an
 * endpoint that should have been public ends up behind a login, and vice
 * versa.
 */
export default defineEventHandler(async (event) => {
  const token = readSessionCookie(event)
  if (!token) return

  const tokenHash = hashSessionToken(token)
  const session = await findSessionUser(database(), tokenHash)
  if (!session) {
    // Expired or revoked: get the dead cookie off the browser.
    clearSessionCookie(event)
    return
  }

  event.context.user = session.user

  // Sliding expiry, but only past the halfway mark: renewing on every request
  // would mean a write per page view for no added safety.
  if (shouldRenew(session.expiresAt)) {
    const extended = issueSession().expiresAt
    await renewSession(database(), tokenHash, extended)
    setSessionCookie(event, token, extended)
  }
})
