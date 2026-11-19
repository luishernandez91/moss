import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { loadEnvFile } from '../dist/config/load-env-file.js';
import { setPassword } from '../dist/auth/set-password.js';
import * as schema from '../dist/database/schema.js';

loadEnvFile();
const email = process.env.E2E_AUTH_EMAIL;
const password = process.env.E2E_AUTH_PASSWORD;
if (!email?.startsWith('e2e-') || !email.endsWith('@example.test') || !password) {
  throw new Error('Faltan las credenciales efímeras de Playwright.');
}
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL,
});
const db = drizzle(pool, { schema });
try {
  if (process.argv[2] === 'create') {
    await setPassword(db, email, password, 'Socio de prueba');
  } else if (process.argv[2] === 'delete') {
    await db.transaction(async (tx) => {
      const [user] = await tx.select().from(schema.users).where(eq(schema.users.email, email));
      if (user) {
        await tx.delete(schema.partners).where(eq(schema.partners.userId, user.id));
        await tx.delete(schema.users).where(eq(schema.users.id, user.id));
      }
    });
  } else {
    throw new Error('Acción de fixture desconocida.');
  }
} finally {
  await pool.end();
}
