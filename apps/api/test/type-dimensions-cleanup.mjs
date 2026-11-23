import pg from 'pg';
import { loadEnvFile } from '../dist/config/load-env-file.js';
loadEnvFile();
const connectionString = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
if (!new URL(connectionString).pathname.endsWith('_test')) throw new Error('Solo bases de prueba.');
const { typeIds, sizeIds } = JSON.parse(process.argv[2]);
const pool = new pg.Pool({ connectionString });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // Solo IDs creados por esta prueba; nunca limpiar por nombre o todo el catálogo.
  await client.query(
    'DELETE FROM variant_cost_changes WHERE variant_id IN (SELECT v.id FROM article_variants v JOIN articles a ON a.id=v.article_id WHERE a.article_type_id=ANY($1::uuid[]))',
    [typeIds],
  );
  await client.query(
    'DELETE FROM article_variants WHERE article_id IN (SELECT id FROM articles WHERE article_type_id=ANY($1::uuid[]))',
    [typeIds],
  );
  await client.query('DELETE FROM articles WHERE article_type_id=ANY($1::uuid[])', [typeIds]);
  await client.query('DELETE FROM article_types WHERE id=ANY($1::uuid[])', [typeIds]);
  await client.query('DELETE FROM sizes WHERE id=ANY($1::uuid[])', [sizeIds]);
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
