import { sql } from 'drizzle-orm';
import type { Database } from '../database/database.module.js';
/** Serializa cambios de tamaño/tipo y las escrituras de variantes, incluido el seed.
 * Dos usuarios y un catálogo pequeño: un bloqueo común evita carreras con tablas vacías.
 */
export async function catalogWrite<T>(
  db: Database,
  action: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(76313, 3)`);
    // Los servicios solo usan el subconjunto select/insert/update/delete/transaction de la sesión.
    return action(tx as unknown as Database);
  });
}
