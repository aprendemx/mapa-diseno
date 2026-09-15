/**
 * Creates an editor account.
 *
 *   npm run create-user -- --email alguien@aprende.gob.mx --name "Nombre"
 *
 * There is no sign-up page and there is not going to be one: three people work
 * here, and an open registration form on an internal tool is a liability with
 * no matching benefit. Accounts are made from a shell, by someone with the
 * database URL.
 *
 * With --password-stdin the password is read from standard input; otherwise a
 * strong one is generated and printed exactly once. It cannot be recovered
 * afterwards, which is the point of storing only a hash.
 */
import { randomBytes } from 'node:crypto'
import { argv, env, exit, stdin } from 'node:process'

import pg from 'pg'
import { hashPassword } from '@mapa-mexico/auth'
import { createUser, findUserByEmail } from '@mapa-mexico/postgres'

function flag(name: string): string | undefined {
  const at = argv.indexOf(`--${name}`)
  return at === -1 ? undefined : argv[at + 1]
}

/**
 * Reading stdin is opt-in via --password-stdin, never inferred from whether
 * the process has a TTY. Inferring it means that anywhere stdin is neither a
 * terminal nor a closed pipe — a CI step, a shell heredoc — this waits forever
 * for input nobody is going to send.
 */
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
const name = flag('name')
const databaseUrl = env['NUXT_DATABASE_URL'] ?? env['DATABASE_URL']

if (!email || !name) {
  console.error('Uso: npm run create-user -- --email <correo> --name "<nombre>"')
  exit(1)
}
if (!databaseUrl) {
  console.error('Falta NUXT_DATABASE_URL (o DATABASE_URL) en el entorno.')
  exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })

try {
  if (await findUserByEmail(pool, email)) {
    console.error(`Ya existe una cuenta con el correo ${email}.`)
    exit(1)
  }

  const piped = await readPipedPassword()
  const password = piped ?? randomBytes(15).toString('base64url')

  const user = await createUser(pool, {
    email,
    name,
    passwordHash: await hashPassword(password),
  })

  console.log(`\nCuenta creada: ${user.name} <${user.email}>`)
  if (!piped) {
    console.log(`Contraseña    : ${password}`)
    console.log('\nAnotala ahora. No se puede recuperar: solo se guarda su hash.\n')
  }
} finally {
  await pool.end()
}
