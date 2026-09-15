import type { Queryable } from './queryable.ts';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  password_hash: string;
}

/** A user identified by an active session; carries no password material. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

/** Emails are compared case-insensitively: nobody remembers how they typed it. */
export async function findUserByEmail(
  db: Queryable,
  email: string,
): Promise<UserRecord | undefined> {
  const result = await db.query(
    'select id, email, name, password_hash from users where lower(email) = lower($1)',
    [email],
  );
  return result.rows[0] as UserRecord | undefined;
}

export async function createUser(
  db: Queryable,
  user: { email: string; name: string; passwordHash: string },
): Promise<SessionUser> {
  const result = await db.query(
    `insert into users (email, name, password_hash) values ($1, $2, $3)
     returning id, email, name`,
    [user.email, user.name, user.passwordHash],
  );
  return result.rows[0] as SessionUser;
}

export async function createSession(
  db: Queryable,
  session: { tokenHash: string; userId: string; expiresAt: Date },
): Promise<void> {
  await db.query(
    'insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)',
    [session.tokenHash, session.userId, session.expiresAt],
  );
}

/**
 * Resolves a session to its user in one query.
 *
 * Expired rows are filtered in SQL rather than in the caller: a session that
 * outlived its deadline must not authenticate anyone, and leaving that check
 * to whoever remembers to write it is how it eventually gets skipped.
 */
export async function findSessionUser(
  db: Queryable,
  tokenHash: string,
): Promise<{ user: SessionUser; expiresAt: Date } | undefined> {
  const result = await db.query(
    `select u.id, u.email, u.name, s.expires_at
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [tokenHash],
  );
  const row = result.rows[0] as
    | { id: string; email: string; name: string; expires_at: Date }
    | undefined;
  if (!row) return undefined;

  return {
    user: { id: row.id, email: row.email, name: row.name },
    expiresAt: row.expires_at,
  };
}

export async function renewSession(
  db: Queryable,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await db.query('update sessions set expires_at = $2 where token_hash = $1', [
    tokenHash,
    expiresAt,
  ]);
}

export async function deleteSession(db: Queryable, tokenHash: string): Promise<void> {
  await db.query('delete from sessions where token_hash = $1', [tokenHash]);
}

/** Signing out everywhere: used when a password changes. */
export async function deleteSessionsForUser(db: Queryable, userId: string): Promise<void> {
  await db.query('delete from sessions where user_id = $1', [userId]);
}

/** Housekeeping. Expired rows never authenticate, but they still take space. */
export async function deleteExpiredSessions(db: Queryable): Promise<number> {
  const result = await db.query('delete from sessions where expires_at <= now() returning 1');
  return result.rows.length;
}
