/**
 * A crude lock on repeated failures, keyed by email.
 *
 * Deliberately in memory: this system runs as one process for three people,
 * and a table would be more moving parts than the threat justifies. Scrypt
 * already caps an attacker at a couple of guesses a second; this caps the
 * patient ones. If the editor ever runs more than one instance, this must move
 * to the database — it counts per process, and it would count wrong.
 */
const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 8

const failures = new Map<string, { count: number; firstAt: number }>()

const key = (email: string): string => email.trim().toLowerCase()

export function isLockedOut(email: string, now = Date.now()): boolean {
  const record = failures.get(key(email))
  if (!record) return false
  if (now - record.firstAt > WINDOW_MS) {
    failures.delete(key(email))
    return false
  }
  return record.count >= MAX_FAILURES
}

export function recordFailure(email: string, now = Date.now()): void {
  const id = key(email)
  const record = failures.get(id)
  if (!record || now - record.firstAt > WINDOW_MS) {
    failures.set(id, { count: 1, firstAt: now })
    return
  }
  record.count += 1
}

export function clearFailures(email: string): void {
  failures.delete(key(email))
}
