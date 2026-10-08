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
      statusMessage: 'Falta NUXT_DATABASE_URL: el editor no tiene base de datos a la que conectarse.',
    })
  }

  pool = new pg.Pool({ connectionString: url, max: 10 })
  return pool
}
