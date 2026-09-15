import type { H3Event } from 'h3'
import type { SessionUser } from '@mapa-mexico/postgres'

/** Every protected handler starts with this line. */
export function requireUser(event: H3Event): SessionUser {
  const user = event.context.user as SessionUser | undefined
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Sesión requerida.' })
  }
  return user
}
