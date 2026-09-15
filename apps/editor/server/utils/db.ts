import pg from 'pg'

let pool: pg.Pool | undefined

/**
 * One pool for the process, opened on first use.
 *
 * Nitro reloads modules in development, so this is deliberately lazy rather
 * than created at import time — otherwise every reload leaks a pool.
 */
export function database(): pg.Pool {
  if (pool) return pool

  const url = useRuntimeConfig().databaseUrl
  if (!url) {
    throw createError({
      statusCode: 500,
      statusMessage: 'NUXT_DATABASE_URL is not set: the editor has no database to talk to.',
    })
  }

  pool = new pg.Pool({ connectionString: url, max: 10 })
  return pool
}
