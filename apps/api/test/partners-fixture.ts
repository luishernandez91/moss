import { eq } from 'drizzle-orm';
import type { Database } from '../src/database/database.module.js';
import { users } from '../src/database/schema.js';
import { setPassword } from '../src/auth/set-password.js';
export const TEST_PARTNER_EMAIL = 'e2e-partner-1@example.test';
export const TEST_PARTNER_PASSWORD = 'solo pruebas';
/** Solo bases de prueba; socios estables compartidos por suites serializadas, sin borrarlos. */
export async function preparePartners(db: Database) {
  const database = new URL(process.env.DATABASE_URL!).pathname;
  if (!database.endsWith('_test') && process.env.CI !== 'true')
    throw new Error('Las fixtures de socios requieren una base _test o CI.');
  const userId = await setPassword(
    db,
    TEST_PARTNER_EMAIL,
    TEST_PARTNER_PASSWORD,
    'Socio de prueba',
  );
  await setPassword(
    db,
    'e2e-partner-2@example.test',
    TEST_PARTNER_PASSWORD,
    'Segundo socio de prueba',
  );
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user!;
}
