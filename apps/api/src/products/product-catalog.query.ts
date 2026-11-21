import { asc, eq, inArray, sql } from 'drizzle-orm';
import {
  cents,
  type CatalogArticle,
  type PersistedComponent,
  type PersistedProduct,
  type ProductCatalog,
  type StockUnit,
} from '@moss/domain';
import type { Database } from '../database/database.module.js';
import {
  articleTypes,
  articleVariants,
  articles,
  attributes,
  productPrices,
  productSizes,
  products,
  recipeComponentValues,
  recipeComponents,
  sizes,
} from '../database/schema.js';

export interface SizeRow {
  id: string;
  key: string;
  label: string;
  active: boolean;
}

export interface LoadedCatalog {
  catalog: ProductCatalog;
  /** Tamaños en su orden (C3), con clave. */
  sizeRows: SizeRow[];
  articleInfo: Map<string, { name: string; active: boolean; stockUnit: StockUnit }>;
  variantInfo: Map<string, { sku: string; active: boolean }>;
  versions: Map<string, number>;
}

/**
 * Carga el catálogo de productos completo en la forma del dominio (C4): productos con su oferta y
 * precios, componentes en orden con sus valores por tamaño, y los artículos que usan las recetas
 * (más `extraArticleIds`, los que trae una escritura). El catálogo es pequeño: dos usuarios.
 */
export async function loadProductCatalog(
  db: Database,
  extraArticleIds: readonly string[] = [],
): Promise<LoadedCatalog> {
  const sizeRows = await db
    .select({ id: sizes.id, key: sizes.key, label: sizes.label, active: sizes.active })
    .from(sizes)
    .orderBy(asc(sizes.sortOrder), asc(sizes.id));
  const sizeOrder = new Map(sizeRows.map((size, index) => [size.id, index]));
  const bySizeOrder = (a: string | null, b: string | null) =>
    (a === null ? -1 : (sizeOrder.get(a) ?? 0)) - (b === null ? -1 : (sizeOrder.get(b) ?? 0));

  const productRows = await db
    .select()
    .from(products)
    .orderBy(asc(products.createdAt), asc(products.id));
  const offerRows = await db.select().from(productSizes);
  const priceRows = await db.select().from(productPrices);
  const componentRows = await db
    .select()
    .from(recipeComponents)
    .orderBy(asc(recipeComponents.productId), asc(recipeComponents.position));
  const valueRows = await db.select().from(recipeComponentValues);

  const persistedProducts: PersistedProduct[] = productRows.map((product) => ({
    id: product.id,
    parentId: product.parentId,
    name: product.name,
    active: product.active,
    sizeOffer: product.inheritsSizes
      ? { mode: 'inherit' }
      : {
          mode: 'explicit',
          sizeIds: offerRows
            .filter((offer) => offer.productId === product.id)
            .map((offer) => offer.sizeId)
            .sort(bySizeOrder),
        },
    prices: priceRows
      .filter((price) => price.productId === product.id)
      .sort((a, b) => bySizeOrder(a.sizeId, b.sizeId))
      .map((price) => ({ sizeId: price.sizeId, price: cents(price.price) })),
  }));

  const persistedComponents: PersistedComponent[] = componentRows.map((row) => {
    const values = valueRows
      .filter((value) => value.componentId === row.id)
      .sort((a, b) => bySizeOrder(a.sizeId, b.sizeId));
    const base = {
      id: row.id,
      productId: row.productId,
      category: row.category,
      replacesComponentId: row.replacesComponentId,
    };
    if (row.articleId === null) {
      return {
        ...base,
        kind: 'fixed',
        concept: row.concept!,
        values: values.map((value) => ({ sizeId: value.sizeId, amount: cents(value.amount!) })),
      };
    }
    return {
      ...base,
      kind: 'article',
      articleId: row.articleId,
      variantId: row.variantId,
      attributeFilter: row.attributeFilter,
      variantSize: row.variantSizeProduced
        ? { match: 'produced' }
        : row.variantSizeId !== null
          ? { match: 'size', sizeId: row.variantSizeId }
          : null,
      concept: row.concept,
      values: values.map((value) => ({ sizeId: value.sizeId, quantity: value.quantity! })),
    };
  });

  const articleIds = [
    ...new Set([
      ...persistedComponents.flatMap((component) =>
        component.kind === 'article' ? [component.articleId] : [],
      ),
      ...extraArticleIds,
    ]),
  ];
  const articleRows =
    articleIds.length === 0
      ? []
      : await db
          .select({
            id: articles.id,
            name: articles.name,
            active: articles.active,
            usedInRecipes: articles.usedInRecipes,
            stockUnit: articles.stockUnit,
            articleTypeId: articles.articleTypeId,
            usesSize: articleTypes.usesSize,
          })
          .from(articles)
          .innerJoin(articleTypes, eq(articleTypes.id, articles.articleTypeId))
          .where(inArray(articles.id, articleIds));
  const typeIds = [...new Set(articleRows.map((row) => row.articleTypeId))];
  const attributeRows =
    typeIds.length === 0
      ? []
      : await db
          .select()
          .from(attributes)
          .where(
            sql`${inArray(attributes.articleTypeId, typeIds)} AND ${attributes.definesVariant}`,
          );
  const variantRows =
    articleRows.length === 0
      ? []
      : await db
          .select()
          .from(articleVariants)
          .where(
            inArray(
              articleVariants.articleId,
              articleRows.map((row) => row.id),
            ),
          )
          .orderBy(asc(articleVariants.createdAt), asc(articleVariants.id));

  const catalogArticles: CatalogArticle[] = articleRows.map((row) => ({
    id: row.id,
    name: row.name,
    stockUnit: row.stockUnit,
    active: row.active,
    usedInRecipes: row.usedInRecipes,
    usesSize: row.usesSize,
    variantAttributes: attributeRows
      .filter((attribute) => attribute.articleTypeId === row.articleTypeId)
      .map((attribute) => ({
        key: attribute.key,
        name: attribute.name,
        dataType: attribute.dataType,
        options: attribute.options,
      })),
    variants: variantRows
      .filter((variant) => variant.articleId === row.id)
      .map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        sizeId: variant.sizeId,
        attributes: variant.attributes,
        averageCost: cents(variant.averageCost),
        active: variant.active,
      })),
  }));

  return {
    catalog: {
      products: persistedProducts,
      components: persistedComponents,
      articles: catalogArticles,
      sizes: sizeRows.map(({ id, label, active }) => ({ id, label, active })),
    },
    sizeRows,
    articleInfo: new Map(
      articleRows.map((row) => [
        row.id,
        { name: row.name, active: row.active, stockUnit: row.stockUnit },
      ]),
    ),
    variantInfo: new Map(variantRows.map((row) => [row.id, { sku: row.sku, active: row.active }])),
    versions: new Map(productRows.map((row) => [row.id, row.version])),
  };
}

/** Árbol de productos por consulta recursiva: profundidad y orden raíz → hojas, por nombre. */
export async function productTreeOrder(db: Database): Promise<{ id: string; depth: number }[]> {
  const result = await db.execute<{ id: string; depth: number }>(sql`
    WITH RECURSIVE tree (id, depth, path) AS (
      SELECT id, 1, ARRAY[lower(name) || '|' || id::text]
        FROM products WHERE parent_id IS NULL
      UNION ALL
      SELECT p.id, t.depth + 1, t.path || (lower(p.name) || '|' || p.id::text)
        FROM products p JOIN tree t ON p.parent_id = t.id
       WHERE t.depth < 3
    )
    SELECT id, depth FROM tree ORDER BY path`);
  return result.rows.map((row) => ({ id: row.id, depth: Number(row.depth) }));
}

/** Ancestros de un producto (raíz → padre) por consulta recursiva, con tope de 3 niveles. */
export async function productAncestors(
  db: Database,
  productId: string,
): Promise<{ id: string; name: string; active: boolean }[]> {
  const result = await db.execute<{ id: string; name: string; active: boolean }>(sql`
    WITH RECURSIVE chain (id, parent_id, name, active, depth) AS (
      SELECT id, parent_id, name, active, 0 FROM products WHERE id = ${productId}
      UNION ALL
      SELECT p.id, p.parent_id, p.name, p.active, c.depth + 1
        FROM products p JOIN chain c ON p.id = c.parent_id
       WHERE c.depth < 3
    )
    SELECT id, name, active FROM chain WHERE depth > 0 ORDER BY depth DESC`);
  return result.rows.map((row) => ({ id: row.id, name: row.name, active: row.active }));
}
