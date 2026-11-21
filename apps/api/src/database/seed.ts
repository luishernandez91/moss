import { catalogWrite } from '../catalog/catalog-write.js';
import { SizeError, assertSizeRequirement, assertSizeAssignment } from '@moss/domain';
/**
 * `pnpm db:seed`: carga `docs/datos/catalogo-ejemplo.json` (tipos, atributos, artículos, variantes,
 * productos y recetas) de forma idempotente. Solo crea lo que falta: nunca actualiza ni borra. Un
 * choque con datos existentes aborta la transacción completa y nombra el conflicto. Usa las reglas
 * del dominio y los esquemas de contracts. C4 traduce `{tamano}` y los tamaños literales de las
 * recetas a la dimensión `size_id` y el SKU de una variante fija a su ID.
 */
import { and, eq, sql } from 'drizzle-orm';
import {
  ArticleError,
  ArticleTypeError,
  AttributeUsageError,
  assertArticleFlags,
  assessNewAttribute,
  attributeKey,
  createAttributeDefinition,
  findDuplicateCombination,
  fromPesos,
  normalizeSku,
  stockUnitLabels,
  validateStock,
  type AttributeDataType,
  type StockUnit,
} from '@moss/domain';
import { buildAttributesSchema, type AttributeDefinitionForValues } from '@moss/contracts';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { countTypeRecords } from '../catalog/attribute-usage.query.js';
import type * as schema from './schema.js';
import {
  articleTypes,
  articleVariants,
  articles,
  attributes,
  variantCostChanges,
  sizes,
} from './schema.js';
// C4 · Productos y recetas.
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import {
  ProductError,
  assertNewReferencesActive,
  persistedComponentKey,
  validateProductCatalog,
  type PersistedComponent,
  type PersistedProduct,
} from '@moss/domain';
import { loadProductCatalog } from '../products/product-catalog.query.js';
import {
  productPrices,
  productSizes,
  products,
  recipeComponentValues,
  recipeComponents,
} from './schema.js';

type Database = NodePgDatabase<typeof schema>;
type SpecValue = string | number | boolean | null;

/** Forma del catálogo de ejemplo, con los nombres de la especificación. */
type SpecPerSize = number | Record<string, number>;

export interface SpecCatalog {
  productos?: {
    id: string;
    parent_id: string | null;
    nombre: string;
    tamanos?: string[];
    componentes: {
      id?: string;
      articulo_id?: string;
      variante_sku?: string;
      filtro_atributos?: Record<string, SpecValue>;
      concepto?: string;
      tipo?: string;
      cantidad?: SpecPerSize;
      monto?: SpecPerSize;
      sustituye_componente_id?: string;
    }[];
    precios?: Record<string, number> | null;
  }[];
  tipos_articulo: {
    id: string;
    nombre: string;
    atributos: {
      nombre: string;
      tipo_dato: 'texto' | 'numero' | 'lista' | 'booleano';
      opciones?: string[];
      unidad?: string;
      requerido: boolean;
      define_variante: boolean;
    }[];
  }[];
  articulos: {
    id: string;
    tipo: string;
    nombre: string;
    descripcion?: string;
    atributos_fijos?: Record<string, SpecValue>;
    se_vende: boolean;
    se_usa_en_recetas: boolean;
    variantes: {
      sku: string;
      atributos: Record<string, SpecValue>;
      costo_promedio: number;
      precio: number | null;
      existencia: number;
    }[];
  }[];
}

export interface SeedCounts {
  articleTypes: number;
  attributes: number;
  articles: number;
  variants: number;
  products: number;
  recipeComponents: number;
}

export interface SeedReport {
  created: SeedCounts;
  existing: SeedCounts;
  /** Artículos creados en piezas porque el catálogo no les da `unidad_consumo`. */
  defaultedToPiece: string[];
  sizedTypes: string[];
}

/** Choque con datos existentes o con las reglas: la transacción se revierte completa. */
export class SeedConflictError extends Error {
  override name = 'SeedConflictError';
}

/** Tabla de equivalencias de §9. */
const DATA_TYPES: Record<
  SpecCatalog['tipos_articulo'][number]['atributos'][number]['tipo_dato'],
  AttributeDataType
> = {
  texto: 'text',
  numero: 'number',
  lista: 'list',
  booleano: 'boolean',
};

/** `unidad_consumo` del ejemplo → `articles.stock_unit`; no se crea como atributo. */
const STOCK_UNIT_ATTRIBUTE = 'unidad_consumo';
const STOCK_UNITS_FROM_SPEC: Record<string, StockUnit> = {
  pieza: 'piece',
  metro: 'm',
  kilogramo: 'kg',
  kg: 'kg',
  litro: 'l',
  bulto: 'bag',
};

/**
 * Etiquetas en español de las claves del ejemplo. Cada etiqueta genera exactamente su clave con
 * `attributeKey`, porque la clave se deriva del nombre (C1).
 */
const LABELS: Record<string, string> = {
  nombre_cientifico: 'Nombre científico',
  toxica_mascotas: 'Tóxica (mascotas)',
  tamano: 'Tamaño',
  diametro: 'Diámetro',
  composicion: 'Composición',
  uso_recomendado: 'Uso recomendado',
  presentacion: 'Presentación',
  npk: 'NPK',
  organico: 'Orgánico',
};

function label(key: string): string {
  const name = LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replaceAll('_', ' ');
  if (attributeKey(name) !== key) {
    throw new SeedConflictError(`La etiqueta «${name}» no genera la clave «${key}».`);
  }
  return name;
}

function withoutNulls(values: Record<string, SpecValue> = {}): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null));
}

/** Convierte errores de dominio y de esquema en un conflicto que nombra el registro. */
function rule<T>(context: string, action: () => T): T {
  try {
    return action();
  } catch (error) {
    if (
      error instanceof SizeError ||
      error instanceof ArticleTypeError ||
      error instanceof ArticleError ||
      error instanceof AttributeUsageError ||
      error instanceof ProductError
    ) {
      throw new SeedConflictError(`${context}: ${error.message}`);
    }
    throw error;
  }
}

function values(
  definitions: readonly AttributeDefinitionForValues[],
  scope: 'fixed' | 'variant',
  input: Record<string, unknown>,
  context: string,
): Record<string, string | number | boolean> {
  const parsed = buildAttributesSchema(definitions, scope).safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || 'atributos'}: ${issue.message}`,
    );
    throw new SeedConflictError(`${context}: ${issues.join('; ')}`);
  }
  return parsed.data;
}

export async function seedCatalog(db: Database, catalog: SpecCatalog): Promise<SeedReport> {
  const zero = (): SeedCounts => ({
    articleTypes: 0,
    attributes: 0,
    articles: 0,
    variants: 0,
    products: 0,
    recipeComponents: 0,
  });
  const created = zero();
  const existing = zero();
  const articleIds = new Map<string, string>();
  const defaultedToPiece: string[] = [];

  const sizedTypes: string[] = [];
  await catalogWrite(db, async (tx) => {
    const sizeRows = await tx.select().from(sizes);
    const sizeKeys: Record<string, string> = {
      mini: 'mini',
      chico: 'small',
      mediano: 'medium',
      grande: 'large',
    };
    const recipeArticleIds = new Set(
      (catalog.productos ?? []).flatMap((p) =>
        p.componentes
          .filter((c) => c.filtro_atributos?.['tamano'] != null)
          .map((c) => c.articulo_id),
      ),
    );
    const sizedTypeIds = new Set(
      catalog.articulos
        .filter(
          (a) =>
            recipeArticleIds.has(a.id) || a.variantes.some((v) => v.atributos['tamano'] != null),
        )
        .map((a) => a.tipo),
    );
    for (const t of catalog.tipos_articulo)
      if (t.atributos.some((a) => a.nombre === 'tamano')) sizedTypeIds.add(t.id);
    const resolveSize = (value: SpecValue | undefined, context: string) => {
      if (value == null) return null;
      const size = sizeRows.find((s) => s.key === sizeKeys[String(value)]);
      if (!size) throw new SeedConflictError(`${context}: tamaño desconocido «${value}».`);
      return size;
    };

    const typeIds = new Map<string, string>();
    const allTypes = await tx
      .select({ id: articleTypes.id, name: articleTypes.name, usesSize: articleTypes.usesSize })
      .from(articleTypes);

    for (const specType of catalog.tipos_articulo) {
      const match = allTypes.find(
        (type) => attributeKey(type.name) === attributeKey(specType.nombre),
      );
      const usesSize = sizedTypeIds.has(specType.id);
      if (usesSize) sizedTypes.push(specType.nombre);
      if (match && match.usesSize !== usesSize)
        throw new SeedConflictError(
          `Tipo «${specType.nombre}»: uses_size no coincide. C3 requiere recrear la base local anterior.`,
        );
      let typeId = match?.id;
      if (typeId) {
        existing.articleTypes += 1;
      } else {
        [{ id: typeId }] = (await tx
          .insert(articleTypes)
          .values({ name: specType.nombre.trim(), usesSize })
          .returning({ id: articleTypes.id })) as [{ id: string }];
        created.articleTypes += 1;
      }
      typeIds.set(specType.id, typeId);

      const current = await tx
        .select()
        .from(attributes)
        .where(eq(attributes.articleTypeId, typeId));
      for (const specAttribute of specType.atributos) {
        if ([STOCK_UNIT_ATTRIBUTE, 'tamano'].includes(specAttribute.nombre)) continue;
        const context = `Tipo «${specType.nombre}», atributo «${specAttribute.nombre}»`;
        const dataType = DATA_TYPES[specAttribute.tipo_dato];
        const found = current.find((attribute) => attribute.key === specAttribute.nombre);
        if (found) {
          const missingOptions = (specAttribute.opciones ?? []).filter(
            (option) => !found.options?.includes(option),
          );
          if (
            found.dataType !== dataType ||
            found.definesVariant !== specAttribute.define_variante ||
            (found.unit ?? null) !== (specAttribute.unidad ?? null) ||
            missingOptions.length > 0
          ) {
            throw new SeedConflictError(
              `${context}: ya existe como ${found.dataType}${found.definesVariant ? ' (define variante)' : ''} y el catálogo lo define como ${dataType}${specAttribute.define_variante ? ' (define variante)' : ''}${missingOptions.length > 0 ? `; le faltan las opciones ${missingOptions.join(', ')}` : ''}.`,
            );
          }
          existing.attributes += 1;
          continue;
        }
        const definition = rule(context, () =>
          createAttributeDefinition(
            {
              name: label(specAttribute.nombre),
              dataType,
              unit: specAttribute.unidad ?? null,
              options: specAttribute.opciones ?? null,
              required: specAttribute.requerido,
              definesVariant: specAttribute.define_variante,
            },
            current,
          ),
        );
        const counts = await countTypeRecords(tx as unknown as Database, typeId);
        rule(context, () =>
          assessNewAttribute(definition, {
            ...counts,
            valueCount: 0,
            missingCount: 0,
            optionsInUse: [],
          }),
        );
        const [row] = await tx
          .insert(attributes)
          .values({ ...definition, articleTypeId: typeId })
          .returning();
        current.push(row!);
        created.attributes += 1;
      }
    }

    for (const specArticle of catalog.articulos) {
      const context = `Artículo «${specArticle.nombre}»`;
      const typeId = typeIds.get(specArticle.tipo);
      if (!typeId)
        throw new SeedConflictError(
          `${context}: el tipo «${specArticle.tipo}» no está en el catálogo.`,
        );
      const definitions = await tx
        .select({
          key: attributes.key,
          name: attributes.name,
          dataType: attributes.dataType,
          options: attributes.options,
          required: attributes.required,
          definesVariant: attributes.definesVariant,
          active: attributes.active,
        })
        .from(attributes)
        .where(eq(attributes.articleTypeId, typeId));

      const { [STOCK_UNIT_ATTRIBUTE]: specUnit, ...fixedInput } = specArticle.atributos_fijos ?? {};
      const stockUnit = specUnit == null ? 'piece' : STOCK_UNITS_FROM_SPEC[String(specUnit)];
      if (!stockUnit) {
        throw new SeedConflictError(
          `${context}: la unidad de consumo «${String(specUnit)}» no es una unidad de existencia válida.`,
        );
      }

      const [found] = await tx
        .select({ id: articles.id, stockUnit: articles.stockUnit })
        .from(articles)
        .where(
          and(
            eq(articles.articleTypeId, typeId),
            sql`lower(${articles.name}) = lower(${specArticle.nombre.trim()})`,
          ),
        );
      let articleId = found?.id;
      if (found && found.stockUnit !== stockUnit) {
        // Las variantes del catálogo expresan costo y existencia en su unidad: no se mezclan.
        throw new SeedConflictError(
          `${context}: ya existe con unidad de existencia «${stockUnitLabels[found.stockUnit]}» y el catálogo usa «${stockUnitLabels[stockUnit]}».`,
        );
      }
      if (articleId) {
        articleIds.set(specArticle.id, articleId);
        existing.articles += 1;
      } else {
        rule(context, () =>
          assertArticleFlags({
            sold: specArticle.se_vende,
            usedInRecipes: specArticle.se_usa_en_recetas,
          }),
        );
        const fixedAttributes = values(definitions, 'fixed', withoutNulls(fixedInput), context);
        [{ id: articleId }] = (await tx
          .insert(articles)
          .values({
            articleTypeId: typeId,
            name: specArticle.nombre.trim(),
            description: specArticle.descripcion ?? null,
            stockUnit,
            sold: specArticle.se_vende,
            usedInRecipes: specArticle.se_usa_en_recetas,
            fixedAttributes,
          })
          .returning({ id: articles.id })) as [{ id: string }];
        created.articles += 1;
        if (specUnit == null) defaultedToPiece.push(specArticle.nombre.trim());
      }
      articleIds.set(specArticle.id, articleId);

      const siblings = await tx
        .select({
          id: articleVariants.id,
          sku: articleVariants.sku,
          sizeId: articleVariants.sizeId,
          attributes: articleVariants.attributes,
          active: articleVariants.active,
        })
        .from(articleVariants)
        .where(eq(articleVariants.articleId, articleId));
      for (const specVariant of specArticle.variantes) {
        const sku = rule(context, () => normalizeSku(specVariant.sku));
        const { tamano, ...rawAttributes } = specVariant.atributos;
        const size = resolveSize(tamano, `${context}, ${sku}`);
        const sizeId = size?.id ?? null;
        rule(context, () => assertSizeRequirement(sizedTypeIds.has(specArticle.tipo), sizeId));
        const [owner] = await tx
          .select({ articleId: articleVariants.articleId, sizeId: articleVariants.sizeId })
          .from(articleVariants)
          .where(eq(articleVariants.sku, sku));
        if (owner) {
          if (owner.articleId !== articleId) {
            throw new SeedConflictError(`${context}: el SKU ${sku} ya pertenece a otro artículo.`);
          }
          if (owner.sizeId !== sizeId)
            throw new SeedConflictError(`${context}: el SKU ${sku} tiene otro tamaño.`);
          existing.variants += 1;
          continue;
        }
        if (size) rule(context, () => assertSizeAssignment(size, null));
        const variantContext = `${context}, variante ${sku}`;
        const variantAttributes = values(
          definitions,
          'variant',
          withoutNulls(rawAttributes),
          variantContext,
        );
        const duplicate = findDuplicateCombination(variantAttributes, siblings, undefined, sizeId);
        if (duplicate) {
          throw new SeedConflictError(
            `${variantContext}: repite la combinación de ${duplicate.sku}.`,
          );
        }
        const averageCost = fromPesos(String(specVariant.costo_promedio));
        const [variant] = await tx
          .insert(articleVariants)
          .values({
            articleId,
            sizeId,
            sku,
            attributes: variantAttributes,
            averageCost,
            price: specVariant.precio === null ? null : fromPesos(String(specVariant.precio)),
            stock: rule(variantContext, () => validateStock(specVariant.existencia)),
          })
          .returning({
            id: articleVariants.id,
            sku: articleVariants.sku,
            sizeId: articleVariants.sizeId,
            attributes: articleVariants.attributes,
            active: articleVariants.active,
          });
        siblings.push(variant!);
        await tx
          .insert(variantCostChanges)
          .values({ variantId: variant!.id, previousCost: null, averageCost, reason: 'initial' });
        created.variants += 1;
      }
    }

    const productReport = await seedProducts(tx, catalog, articleIds, (value, context) => {
      const size = resolveSize(value, context);
      if (!size) throw new SeedConflictError(`${context}: falta el tamaño.`);
      return size.id;
    });
    created.products = productReport.created.products;
    created.recipeComponents = productReport.created.recipeComponents;
    existing.products = productReport.existing.products;
    existing.recipeComponents = productReport.existing.recipeComponents;
  });

  return { created, existing, defaultedToPiece, sizedTypes };
}

type SpecProduct = NonNullable<SpecCatalog['productos']>[number];
type SpecComponent = SpecProduct['componentes'][number];

/**
 * C4: crea los productos que faltan, por nombre, con su oferta de tamaños, precios y receta. Un
 * producto existente no se toca (si tiene otro padre, es un choque). `sustituye_componente_id` se
 * resuelve con los componentes creados en esta corrida o, si el ancestro ya existía, con el
 * componente que tiene la misma identidad de grupo (D2). Al final valida nombres y árbol de todo el
 * catálogo, y oferta, precios y recetas de los productos creados (como una escritura de la API).
 */
async function seedProducts(
  tx: Database,
  catalog: SpecCatalog,
  articleIds: ReadonlyMap<string, string>,
  sizeId: (value: SpecValue, context: string) => string,
): Promise<{
  created: Pick<SeedCounts, 'products' | 'recipeComponents'>;
  existing: Pick<SeedCounts, 'products' | 'recipeComponents'>;
}> {
  const created = { products: 0, recipeComponents: 0 };
  const existing = { products: 0, recipeComponents: 0 };
  const specProducts = catalog.productos ?? [];
  if (specProducts.length === 0) return { created, existing };

  const loaded = await loadProductCatalog(tx, [...articleIds.values()]);
  const productCatalog = {
    ...loaded.catalog,
    products: [...loaded.catalog.products],
    components: [...loaded.catalog.components],
  };
  const productIds = new Map<string, string>();
  const componentIds = new Map<string, string>();
  const createdProducts: { product: PersistedProduct; components: PersistedComponent[] }[] = [];

  const variantRows = await tx
    .select({
      id: articleVariants.id,
      sku: articleVariants.sku,
      articleId: articleVariants.articleId,
    })
    .from(articleVariants)
    .where(inArray(articleVariants.articleId, [...articleIds.values()]));

  // Padres antes que hijos, sin depender del orden del JSON.
  const pending = [...specProducts];
  while (pending.length > 0) {
    const index = pending.findIndex(
      (product) => product.parent_id === null || productIds.has(product.parent_id),
    );
    if (index === -1) {
      throw new SeedConflictError(
        `Producto «${pending[0]!.nombre}»: su padre «${pending[0]!.parent_id}» no está en el catálogo.`,
      );
    }
    const [spec] = pending.splice(index, 1) as [SpecProduct];
    const name = spec.nombre.trim();
    const context = `Producto «${name}»`;
    const parentId = spec.parent_id === null ? null : productIds.get(spec.parent_id)!;
    const specComponents = spec.componentes.map((component, position) => ({
      key: component.id ?? `${spec.id}-${position + 1}`,
      component,
    }));

    const found = productCatalog.products.find(
      (product) => product.name.toLocaleLowerCase('es-MX') === name.toLocaleLowerCase('es-MX'),
    );
    if (found) {
      if (found.parentId !== parentId) {
        throw new SeedConflictError(`${context}: ya existe con otro padre.`);
      }
      productIds.set(spec.id, found.id);
      existing.products += 1;
      existing.recipeComponents += specComponents.length;
      // Identidad de los componentes ya guardados, para las sustituciones de productos nuevos.
      const stored = productCatalog.components.filter(
        (component) => component.productId === found.id,
      );
      for (const { key, component } of specComponents) {
        const draft = toComponent(component, randomUUID(), found.id, context);
        const match = stored.find(
          (candidate) => persistedComponentKey(candidate) === persistedComponentKey(draft),
        );
        if (match) componentIds.set(key, match.id);
      }
      continue;
    }

    const id = randomUUID();
    productIds.set(spec.id, id);
    const product: PersistedProduct = {
      id,
      parentId,
      name,
      active: true,
      sizeOffer: spec.tamanos
        ? { mode: 'explicit', sizeIds: spec.tamanos.map((size) => sizeId(size, context)) }
        : { mode: 'inherit' },
      prices: Object.entries(spec.precios ?? {}).map(([size, price]) => ({
        sizeId: sizeId(size, `${context}, precio`),
        price: fromPesos(String(price)),
      })),
    };
    const components = specComponents.map(({ key, component }) => {
      const stored = toComponent(component, randomUUID(), id, `${context}, componente ${key}`);
      componentIds.set(key, stored.id);
      return { stored, replaces: component.sustituye_componente_id };
    });
    const persisted = components.map(({ stored, replaces }) => {
      if (replaces === undefined) return stored;
      const target = componentIds.get(replaces);
      if (!target) {
        throw new SeedConflictError(
          `${context}: sustituye al componente «${replaces}», que no se encontró en sus ancestros.`,
        );
      }
      return { ...stored, replacesComponentId: target };
    });
    productCatalog.products.push(product);
    productCatalog.components.push(...persisted);
    createdProducts.push({ product, components: persisted });
    created.products += 1;
    created.recipeComponents += persisted.length;
  }

  rule('Productos', () => {
    validateProductCatalog(
      productCatalog,
      createdProducts.map((state) => state.product.id),
    );
    for (const state of createdProducts) assertNewReferencesActive(null, state, productCatalog);
  });

  for (const { product } of createdProducts) {
    await tx.insert(products).values({
      id: product.id,
      parentId: product.parentId,
      name: product.name,
      inheritsSizes: product.sizeOffer.mode === 'inherit',
    });
    if (product.sizeOffer.mode === 'explicit') {
      await tx
        .insert(productSizes)
        .values(product.sizeOffer.sizeIds.map((size) => ({ productId: product.id, sizeId: size })));
    }
    if (product.prices.length > 0) {
      await tx.insert(productPrices).values(
        product.prices.map(({ sizeId: size, price }) => ({
          productId: product.id,
          sizeId: size,
          price,
        })),
      );
    }
  }
  // Los componentes van después de todos los productos: una sustitución apunta a otro producto.
  for (const { product, components } of createdProducts) {
    for (const [position, component] of components.entries()) {
      await tx.insert(recipeComponents).values({
        id: component.id,
        productId: product.id,
        position,
        articleId: component.kind === 'article' ? component.articleId : null,
        variantId: component.kind === 'article' ? component.variantId : null,
        attributeFilter: component.kind === 'article' ? { ...component.attributeFilter } : {},
        variantSizeProduced:
          component.kind === 'article' && component.variantSize?.match === 'produced',
        variantSizeId:
          component.kind === 'article' && component.variantSize?.match === 'size'
            ? component.variantSize.sizeId
            : null,
        concept: component.concept,
        category: component.category,
        replacesComponentId: component.replacesComponentId,
      });
      await tx.insert(recipeComponentValues).values(
        component.kind === 'fixed'
          ? component.values.map(({ sizeId: size, amount }) => ({
              componentId: component.id,
              sizeId: size,
              amount,
            }))
          : component.values.map(({ sizeId: size, quantity }) => ({
              componentId: component.id,
              sizeId: size,
              quantity,
            })),
      );
    }
  }
  return { created, existing };

  function toComponent(
    spec: SpecComponent,
    id: string,
    productId: string,
    context: string,
  ): PersistedComponent {
    const base = {
      id,
      productId,
      category: spec.tipo === 'mano_obra' ? ('labor' as const) : ('material' as const),
      replacesComponentId: null,
    };
    const perSize = <T>(raw: SpecPerSize, wrap: (value: number) => T) =>
      typeof raw === 'number'
        ? [{ sizeId: null, ...wrap(raw) }]
        : Object.entries(raw).map(([size, value]) => ({
            sizeId: sizeId(size, context),
            ...wrap(value),
          }));
    if (spec.articulo_id === undefined) {
      if (spec.monto === undefined || spec.concepto === undefined) {
        throw new SeedConflictError(
          `${context}: un componente sin artículo necesita concepto y monto.`,
        );
      }
      return {
        ...base,
        kind: 'fixed',
        concept: spec.concepto.trim(),
        values: perSize(spec.monto, (amount) => ({ amount: fromPesos(String(amount)) })),
      };
    }
    const articleId = articleIds.get(spec.articulo_id);
    if (!articleId) {
      throw new SeedConflictError(
        `${context}: el artículo «${spec.articulo_id}» no está en el catálogo.`,
      );
    }
    let variantId: string | null = null;
    if (spec.variante_sku !== undefined) {
      const sku = rule(context, () => normalizeSku(spec.variante_sku!));
      const variant = variantRows.find((row) => row.sku === sku);
      if (!variant || variant.articleId !== articleId) {
        throw new SeedConflictError(
          `${context}: la variante ${sku} no es de «${spec.articulo_id}».`,
        );
      }
      variantId = variant.id;
    }
    const { tamano, ...filter } = withoutNulls(spec.filtro_atributos) as Record<
      string,
      string | number | boolean
    >;
    return {
      ...base,
      kind: 'article',
      articleId,
      variantId,
      attributeFilter: filter,
      variantSize:
        tamano === undefined
          ? null
          : tamano === '{tamano}'
            ? { match: 'produced' }
            : { match: 'size', sizeId: sizeId(tamano, context) },
      concept: spec.concepto?.trim() ?? null,
      values: perSize(spec.cantidad ?? 1, (quantity) => ({ quantity })),
    };
  }
}
