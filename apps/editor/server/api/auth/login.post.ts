import { burnVerificationTime, issueSession, verifyPassword } from '@mapa-mexico/auth'
import { createSession, findUserByEmail } from '@mapa-mexico/postgres'

interface LoginBody {
  email?: unknown
  password?: unknown
}

export default defineEventHandler(async (event) => {
  const body = await readBody<LoginBody>(event)
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!email || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Falta el correo o la contraseña.' })
  }

  if (isLockedOut(email)) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Demasiados intentos fallidos. Esperá unos minutos.',
    })
  }

  const db = database()
  const user = await findUserByEmail(db, email)

  // Unknown email and wrong password must cost the same and say the same. One
  // that answers faster, or differently, is a way to enumerate who has access.
  if (!user) {
    await burnVerificationTime()
    recordFailure(email)
    throw createError({ statusCode: 401, statusMessage: 'Correo o contraseña incorrectos.' })
  }

  if (!(await verifyPassword(password, user.password_hash))) {
    recordFailure(email)
    throw createError({ statusCode: 401, statusMessage: 'Correo o contraseña incorrectos.' })
  }

  clearFailures(email)

  const session = issueSession()
  await createSession(db, {
    tokenHash: session.tokenHash,
    userId: user.id,
    expiresAt: session.expiresAt,
  })
  setSessionCookie(event, session.token, session.expiresAt)

  return { user: { id: user.id, email: user.email, name: user.name } }
})
