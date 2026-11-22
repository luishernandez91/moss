import { inArray, like, or } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../src/database/schema.js';
import {
  articleTypes,
  articleVariants,
  articles,
  productPrices,
  productSizes,
  products,
  recipeComponents,
  variantCostChanges,
} from '../src/database/schema.js';

type Database = NodePgDatabase<typeof schema>;

/** Borra los datos de catálogo de una prueba (sin endpoint de borrado: artículos y variantes se desactivan). */
export async function deleteCatalogByPrefix(db: Database, prefix: string): Promise<void> {
  await deleteProductsByPrefix(db, prefix);
  const typeIds = (
    await db
      .select({ id: articleTypes.id })
      .from(articleTypes)
      .where(like(articleTypes.name, `${prefix}%`))
  ).map((row) => row.id);
  if (typeIds.length === 0) return;
  const articleIds = (
    await db
      .select({ id: articles.id })
      .from(articles)
      .where(inArray(articles.articleTypeId, typeIds))
  ).map((row) => row.id);
  if (articleIds.length > 0) {
    const variantIds = (
      await db
        .select({ id: articleVariants.id })
        .from(articleVariants)
        .where(inArray(articleVariants.articleId, articleIds))
    ).map((row) => row.id);
    if (variantIds.length > 0) {
      await db.delete(variantCostChanges).where(inArray(variantCostChanges.variantId, variantIds));
      await db.delete(articleVariants).where(inArray(articleVariants.id, variantIds));
    }
    await db.delete(articles).where(inArray(articles.id, articleIds));
  }
  await db.delete(articleTypes).where(inArray(articleTypes.id, typeIds));
}

/** Borra los productos de una prueba con sus recetas (no hay borrado de productos en la API). */
export async function deleteProductsByPrefix(db: Database, prefix: string): Promise<void> {
  const ids = (
    await db
      .select({ id: products.id })
      .from(products)
      .where(like(products.name, `${prefix}%`))
  ).map((row) => row.id);
  if (ids.length === 0) return;
  // Sustituciones y padres apuntan dentro del mismo conjunto: se sueltan antes de borrar (RESTRICT).
  await db
    .update(recipeComponents)
    .set({ replacesComponentId: null })
    .where(inArray(recipeComponents.productId, ids));
  await db.delete(recipeComponents).where(inArray(recipeComponents.productId, ids));
  await db.delete(productPrices).where(inArray(productPrices.productId, ids));
  await db.delete(productSizes).where(inArray(productSizes.productId, ids));
  await db
    .update(products)
    .set({ parentId: null })
    .where(or(inArray(products.id, ids), inArray(products.parentId, ids)));
  await db.delete(products).where(inArray(products.id, ids));
}
