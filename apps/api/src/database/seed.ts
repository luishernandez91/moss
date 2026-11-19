/**
 * `pnpm db:seed`: carga `docs/datos/catalogo-ejemplo.json` (tipos, atributos, artículos y variantes)
 * de forma idempotente. Solo crea lo que falta: nunca actualiza ni borra. Un choque con datos
 * existentes aborta la transacción completa y nombra el conflicto. Usa las reglas del dominio y los
 * esquemas de contracts. Productos, recetas y la traducción `{tamano}` → `{size}` llegan con C4.
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
} from './schema.js';

type Database = NodePgDatabase<typeof schema>;
type SpecValue = string | number | boolean | null;

/** Forma del catálogo de ejemplo, con los nombres de la especificación. */
export interface SpecCatalog {
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
}

export interface SeedReport {
  created: SeedCounts;
  existing: SeedCounts;
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
      error instanceof ArticleTypeError ||
      error instanceof ArticleError ||
      error instanceof AttributeUsageError
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
  const created: SeedCounts = { articleTypes: 0, attributes: 0, articles: 0, variants: 0 };
  const existing: SeedCounts = { articleTypes: 0, attributes: 0, articles: 0, variants: 0 };

  await db.transaction(async (tx) => {
    const typeIds = new Map<string, string>();
    const allTypes = await tx
      .select({ id: articleTypes.id, name: articleTypes.name })
      .from(articleTypes);

    for (const specType of catalog.tipos_articulo) {
      const match = allTypes.find(
        (type) => attributeKey(type.name) === attributeKey(specType.nombre),
      );
      let typeId = match?.id;
      if (typeId) {
        existing.articleTypes += 1;
      } else {
        [{ id: typeId }] = (await tx
          .insert(articleTypes)
          .values({ name: specType.nombre.trim() })
          .returning({ id: articleTypes.id })) as [{ id: string }];
        created.articleTypes += 1;
      }
      typeIds.set(specType.id, typeId);

      const current = await tx
        .select()
        .from(attributes)
        .where(eq(attributes.articleTypeId, typeId));
      for (const specAttribute of specType.atributos) {
        if (specAttribute.nombre === STOCK_UNIT_ATTRIBUTE) continue;
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
      }

      const siblings = await tx
        .select({
          id: articleVariants.id,
          sku: articleVariants.sku,
          attributes: articleVariants.attributes,
          active: articleVariants.active,
        })
        .from(articleVariants)
        .where(eq(articleVariants.articleId, articleId));
      for (const specVariant of specArticle.variantes) {
        const sku = rule(context, () => normalizeSku(specVariant.sku));
        const [owner] = await tx
          .select({ articleId: articleVariants.articleId })
          .from(articleVariants)
          .where(eq(articleVariants.sku, sku));
        if (owner) {
          if (owner.articleId !== articleId) {
            throw new SeedConflictError(`${context}: el SKU ${sku} ya pertenece a otro artículo.`);
          }
          existing.variants += 1;
          continue;
        }
        const variantContext = `${context}, variante ${sku}`;
        const variantAttributes = values(
          definitions,
          'variant',
          withoutNulls(specVariant.atributos),
          variantContext,
        );
        const duplicate = findDuplicateCombination(variantAttributes, siblings);
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
            sku,
            attributes: variantAttributes,
            averageCost,
            price: specVariant.precio === null ? null : fromPesos(String(specVariant.precio)),
            stock: rule(variantContext, () => validateStock(specVariant.existencia)),
          })
          .returning({
            id: articleVariants.id,
            sku: articleVariants.sku,
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
  });

  return { created, existing };
}
