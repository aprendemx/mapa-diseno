/**
 * Reestablece la contraseña de una cuenta.
 *
 *   npm run reset-password -- --email alguien@aprende.gob.mx
 *   printf 'la-nueva' | npm run reset-password -- --email … --password-stdin
 *
 * La contraseña no se puede *recuperar* --solo se guarda su hash-- pero
 * reestablecerla tiene que ser posible: sin esto, perder una contraseña
 * significa perder la cuenta, y con tres personas eso es cuestión de tiempo.
 *
 * Cierra todas las sesiones de esa cuenta. Si alguien reestablece una
 * contraseña es porque sospecha que se filtró o porque la olvidó; en los dos
 * casos las sesiones abiertas sobran.
 */
import { randomBytes } from 'node:crypto'
import { argv, env, exit, stdin } from 'node:process'

import pg from 'pg'
import { hashPassword } from '@mapa-mexico/auth'
import { deleteSessionsForUser, findUserByEmail } from '@mapa-mexico/postgres'

function flag(name: string): string | undefined {
  const at = argv.indexOf(`--${name}`)
  return at === -1 ? undefined : argv[at + 1]
}

/** Opt-in explícito: inferirlo del TTY cuelga donde stdin no es ninguna de las dos cosas. */
async function readPipedPassword(): Promise<string | undefined> {
  if (!argv.includes('--password-stdin')) return undefined

  const chunks: Buffer[] = []
  for await (const chunk of stdin) chunks.push(chunk as Buffer)
  const piped = Buffer.concat(chunks).toString('utf8').trim()

  if (!piped) {
    console.error('Se indicó --password-stdin pero no llegó ninguna contraseña.')
    exit(1)
  }
  return piped
}

const email = flag('email')
const databaseUrl = env['NUXT_DATABASE_URL'] ?? env['DATABASE_URL']

if (!email) {
  console.error('Uso: npm run reset-password -- --email <correo> [--password-stdin]')
  exit(1)
}
if (!databaseUrl) {
  console.error('Falta NUXT_DATABASE_URL (o DATABASE_URL) en el entorno.')
  exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })

try {
  const user = await findUserByEmail(pool, email)
  if (!user) {
    console.error(`No existe ninguna cuenta con el correo ${email}.`)
    exit(1)
  }

  const piped = await readPipedPassword()
  const password = piped ?? randomBytes(15).toString('base64url')

  await pool.query('update users set password_hash = $2 where id = $1', [
    user.id,
    await hashPassword(password),
  ])
  await deleteSessionsForUser(pool, user.id)

  console.log(`\nContraseña reestablecida: ${user.name} <${user.email}>`)
  if (!piped) {
    console.log(`Contraseña nueva        : ${password}`)
    console.log('\nAnotala ahora. No se puede recuperar: solo se guarda su hash.')
  }
  console.log('Las sesiones abiertas de esa cuenta quedaron cerradas.\n')
} finally {
  await pool.end()
}
