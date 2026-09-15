import { hashSessionToken } from '@mapa-mexico/auth'
import { deleteSession } from '@mapa-mexico/postgres'

export default defineEventHandler(async (event) => {
  const token = readSessionCookie(event)
  // Removed server-side too: clearing the cookie alone would leave a token
  // that still works for anyone who copied it.
  if (token) await deleteSession(database(), hashSessionToken(token))

  clearSessionCookie(event)
  return { ok: true }
})
