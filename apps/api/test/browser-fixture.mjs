import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { loadEnvFile } from '../dist/config/load-env-file.js';
import { setPassword } from '../dist/auth/set-password.js';
import * as schema from '../dist/database/schema.js';
loadEnvFile();
const email = process.env.E2E_AUTH_EMAIL;
const password = process.env.E2E_AUTH_PASSWORD;
const connectionString = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
if (!new URL(connectionString).pathname.endsWith('_test') && process.env.CI !== 'true')
  throw new Error('Playwright requiere una base _test o CI.');
if (email !== 'e2e-partner-1@example.test' || !password)
  throw new Error('Faltan las credenciales de prueba de Playwright.');
const pool = new pg.Pool({ connectionString });
try {
  const db = drizzle(pool, { schema });
  await setPassword(db, email, password, 'Socio de prueba');
  await setPassword(db, 'e2e-partner-2@example.test', password, 'Segundo socio de prueba');
} finally {
  await pool.end();
}
