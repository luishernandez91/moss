import { and, count, eq, sql } from 'drizzle-orm';
import type { AttributeUsage } from '@moss/domain';
import type { Database } from '../database/database.module.js';
import { articleVariants, articles } from '../database/schema.js';

/** Artículos y variantes (activos o no) de un tipo. */
export async function countTypeRecords(
  db: Database,
  typeId: string,
): Promise<{ typeArticleCount: number; typeVariantCount: number }> {
  const [articleRow] = await db
    .select({ total: count() })
    .from(articles)
    .where(eq(articles.articleTypeId, typeId));
  const [variantRow] = await db
    .select({ total: count() })
    .from(articleVariants)
    .innerJoin(articles, eq(articles.id, articleVariants.articleId))
    .where(eq(articles.articleTypeId, typeId));
  return { typeArticleCount: articleRow!.total, typeVariantCount: variantRow!.total };
}

/**
 * Uso de una clave de atributo en su alcance actual: `fixed_attributes` de los artículos del tipo
 * si es fijo, `attributes` de sus variantes si define variante. Consultas `jsonb`.
 */
export async function loadAttributeUsage(
  db: Database,
  typeId: string,
  key: string,
  definesVariant: boolean,
): Promise<AttributeUsage> {
  const totals = await countTypeRecords(db, typeId);
  const column = definesVariant ? articleVariants.attributes : articles.fixedAttributes;
  const scopeTotal = definesVariant ? totals.typeVariantCount : totals.typeArticleCount;
  const base = db
    .select({ value: sql<string>`${column} ->> ${key}`.as('value'), total: count() })
    .from(articles);
  const query = definesVariant
    ? base.innerJoin(articleVariants, eq(articleVariants.articleId, articles.id))
    : base;
  const rows = await query
    .where(and(eq(articles.articleTypeId, typeId), sql`jsonb_exists(${column}, ${key})`))
    // Por posición: con parámetros distintos, PostgreSQL no reconoce la misma expresión.
    .groupBy(sql`1`);
  const valueCount = rows.reduce((sum, row) => sum + row.total, 0);
  return {
    ...totals,
    valueCount,
    missingCount: scopeTotal - valueCount,
    optionsInUse: rows.map((row) => row.value),
  };
}
