import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

for (const path of ['.env', '../../.env']) {
  if (existsSync(path)) {
    process.loadEnvFile(path);
    break;
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error('Falta DATABASE_URL. Copia .env.example a .env en la raíz del repositorio.');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL },
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
