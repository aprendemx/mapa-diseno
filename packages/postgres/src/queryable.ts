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

/** Builds `($1, $2), ($3, $4)` for a multi-row insert of `width` columns. */
export function placeholders(count: number, width: number): string {
  return Array.from({ length: count }, (_, row) => {
    const slots = Array.from({ length: width }, (_, column) => `$${row * width + column + 1}`);
    return `(${slots.join(', ')})`;
  }).join(', ');
}
