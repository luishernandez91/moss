import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { loadEnvFile } from '../config/load-env-file.js';
import * as schema from './schema.js';
import { SeedConflictError, seedCatalog, type SpecCatalog } from './seed.js';

loadEnvFile();
const catalogUrl = new URL('../../../../docs/datos/catalogo-ejemplo.json', import.meta.url);
const catalog = JSON.parse(readFileSync(catalogUrl, 'utf8')) as SpecCatalog;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const { created, existing, defaultedToPiece } = await seedCatalog(
    drizzle(pool, { schema }),
    catalog,
  );
  const line = (counts: typeof created) =>
    `${counts.articleTypes} tipos, ${counts.attributes} atributos, ${counts.articles} artículos, ${counts.variants} variantes`;
  console.log(`Creados: ${line(created)}.`);
  console.log(`Ya existían: ${line(existing)}.`);
  if (defaultedToPiece.length > 0) {
    console.log(
      `En piezas por no tener unidad_consumo (${defaultedToPiece.length}): ${defaultedToPiece.join(', ')}.`,
    );
  }
} catch (error) {
  if (error instanceof SeedConflictError) {
    console.error(`No se cargó nada. ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await pool.end();
}
