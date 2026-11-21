import pg from 'pg';
import { loadEnvFile } from '../config/load-env-file.js';
import { compareMigrationHistory, readJournal } from './migration-history.js';

loadEnvFile();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Falta DATABASE_URL.');
const migrationsFolder = new URL('../../drizzle', import.meta.url).pathname;
const database = new URL(connectionString).pathname.slice(1);

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const { rows } = await client.query<{ id: number; hash: string; created_at: string }>(
    'SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id',
  );
  const journal = readJournal(migrationsFolder);
  const problems = compareMigrationHistory(
    journal,
    rows.map((row) => ({ id: row.id, hash: row.hash, createdAt: Number(row.created_at) })),
  );
  if (problems.length > 0) {
    console.error(`La base «${database}» no coincide con las migraciones del repositorio:`);
    for (const problem of problems) console.error(`- ${problem}`);
    console.error('Recrea esa base (DROP y CREATE) y vuelve a correr pnpm db:migrate.');
    process.exitCode = 1;
  } else {
    console.log(
      `La base «${database}» tiene las ${journal.length} migraciones del journal, en orden y con el mismo hash.`,
    );
  }
} finally {
  await client.end();
}
