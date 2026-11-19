import { eq, inArray, like } from 'drizzle-orm';
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
      // Catálogo creado por Playwright: tipos «e2e …». Artículos y variantes no tienen endpoint de
      // borrado (solo se desactivan), así que se limpian aquí, en orden de llaves foráneas.
      const types = await tx
        .select({ id: schema.articleTypes.id })
        .from(schema.articleTypes)
        .where(like(schema.articleTypes.name, 'e2e %'));
      const typeIds = types.map((type) => type.id);
      if (typeIds.length > 0) {
        const articleIds = (
          await tx
            .select({ id: schema.articles.id })
            .from(schema.articles)
            .where(inArray(schema.articles.articleTypeId, typeIds))
        ).map((article) => article.id);
        if (articleIds.length > 0) {
          const variantIds = (
            await tx
              .select({ id: schema.articleVariants.id })
              .from(schema.articleVariants)
              .where(inArray(schema.articleVariants.articleId, articleIds))
          ).map((variant) => variant.id);
          if (variantIds.length > 0) {
            await tx
              .delete(schema.variantCostChanges)
              .where(inArray(schema.variantCostChanges.variantId, variantIds));
            await tx
              .delete(schema.articleVariants)
              .where(inArray(schema.articleVariants.id, variantIds));
          }
          await tx.delete(schema.articles).where(inArray(schema.articles.id, articleIds));
        }
        await tx.delete(schema.articleTypes).where(inArray(schema.articleTypes.id, typeIds));
      }
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
