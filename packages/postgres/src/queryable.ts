/**
 * The narrowest slice of the driver this package needs.
 *
 * Declaring it here rather than importing `pg.Pool` means a transaction client
 * and a pool are interchangeable at every call site, and the repository never
 * decides which one it is running inside.
 */
export interface Queryable {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }>;
}

/**
 * A source of dedicated connections — a pool, in practice.
 *
 * Transactions need one: `BEGIN` and `COMMIT` issued against a pool are two
 * independent checkouts, and under any concurrency at all they land on
 * different connections. One request's `BEGIN` then pairs with another's
 * `COMMIT`, and the failure only appears once two people use the editor at the
 * same time — which is the entire reason this system has a database.
 */
export interface Pooled extends Queryable {
  connect(): Promise<Queryable & { release(): void }>;
}

/**
 * Runs `work` inside one transaction on one connection.
 *
 * Nothing else in this package may issue BEGIN, COMMIT or ROLLBACK.
 */
export async function withTransaction<T>(
  db: Pooled,
  work: (tx: Queryable) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Builds `($1, $2), ($3, $4)` for a multi-row insert of `width` columns. */
export function placeholders(count: number, width: number): string {
  return Array.from({ length: count }, (_, row) => {
    const slots = Array.from({ length: width }, (_, column) => `$${row * width + column + 1}`);
    return `(${slots.join(', ')})`;
  }).join(', ');
}
