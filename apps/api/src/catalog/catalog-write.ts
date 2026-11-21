import { sql } from 'drizzle-orm';
import type { Database } from '../database/database.module.js';

/** Identidad única del bloqueo que comparten las escrituras de API y seed. */
export const CATALOG_WRITE_LOCK = { namespace: 76313, key: 3 } as const;

/** Serializa cambios de tamaño/tipo y las escrituras de variantes, incluido el seed.
 * Dos usuarios y un catálogo pequeño: un bloqueo común evita carreras con tablas vacías.
 */
export async function catalogWrite<T>(
  db: Database,
  action: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${CATALOG_WRITE_LOCK.namespace}, ${CATALOG_WRITE_LOCK.key})`,
    );
    // Los servicios solo usan el subconjunto select/insert/update/delete/transaction de la sesión.
    return action(tx as unknown as Database);
  });
}
