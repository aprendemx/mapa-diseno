import type { H3Event } from 'h3'

export const SESSION_COOKIE = 'mapa_session'

/**
 * HttpOnly so no script can read it, SameSite=Lax so it does not ride along
 * with cross-site form posts, Secure unless explicitly told otherwise.
 */
export function setSessionCookie(event: H3Event, token: string, expiresAt: Date): void {
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: useRuntimeConfig().insecureCookies !== 'true',
    path: '/',
    expires: expiresAt,
  })
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: useRuntimeConfig().insecureCookies !== 'true',
    path: '/',
  })
}

export const readSessionCookie = (event: H3Event): string | undefined =>
  getCookie(event, SESSION_COOKIE)
