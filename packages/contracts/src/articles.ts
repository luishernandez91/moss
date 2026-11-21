/**
 * Contratos de artículos y variantes (C2). `buildAttributesSchema` construye, a partir de las
 * definiciones de C1, el esquema que web y API usan para validar los valores de atributo.
 */
import {
  ARTICLE_NAME_MAX,
  SKU_MAX,
  STOCK_UNITS,
  type AttributeDataType,
  type StockUnit,
} from '@moss/domain';
import { z } from 'zod';
import { centsSchema } from './common.js';

export type { StockUnit };
export { stockUnitLabels } from '@moss/domain';
export const stockUnitSchema = z.enum(STOCK_UNITS);

/** Lo que el esquema de valores necesita de cada definición de atributo. */
export interface AttributeDefinitionForValues {
  key: string;
  name: string;
  dataType: AttributeDataType;
  options: readonly string[] | null;
  required: boolean;
  definesVariant: boolean;
  active: boolean;
}

export type AttributeValue = string | number | boolean;
export type AttributeValues = Record<string, AttributeValue>;

const TEXT_VALUE_MAX = 200;

function valueSchema(definition: AttributeDefinitionForValues): z.ZodType<AttributeValue> {
  const invalid = { error: `Valor inválido para «${definition.name}».` };
  switch (definition.dataType) {
    case 'text':
      return z
        .string(invalid)
        .trim()
        .min(1, `Escribe un valor para «${definition.name}».`)
        .max(TEXT_VALUE_MAX, `Usa como máximo ${TEXT_VALUE_MAX} caracteres.`);
    case 'number':
      return z.number(invalid).finite(invalid.error);
    case 'list':
      return z.enum(definition.options as [string, ...string[]], {
        error: `Elige una opción de «${definition.name}».`,
      });
    case 'boolean':
      return z.boolean(invalid);
  }
}

/**
 * Esquema de valores para un alcance: `fixed` (atributos que no definen variante, en el artículo)
 * o `variant` (los que definen variante, en cada variante). Los requeridos activos son
 * obligatorios; los inactivos son opcionales para no romper valores ya guardados. Rechaza claves
 * desconocidas.
 */
export function buildAttributesSchema(
  definitions: readonly AttributeDefinitionForValues[],
  scope: 'fixed' | 'variant',
): z.ZodType<AttributeValues> {
  const shape: Record<string, z.ZodType<AttributeValue | undefined>> = {};
  for (const definition of definitions) {
    if (definition.definesVariant !== (scope === 'variant')) continue;
    const schema = valueSchema(definition);
    shape[definition.key] =
      definition.active && definition.required
        ? schema
        : (schema.optional() as z.ZodType<AttributeValue | undefined>);
  }
  return z.strictObject(shape, {
    error: (issue) =>
      issue.code === 'unrecognized_keys'
        ? 'El tipo de artículo no tiene ese atributo.'
        : 'Atributos inválidos.',
  }) as z.ZodType<AttributeValues>;
}

/** Convierte el texto de un filtro `?attr=clave:valor` al tipo de dato del atributo. */
export function attributeFilterValueSchema(
  definition: AttributeDefinitionForValues,
): z.ZodType<AttributeValue, string> {
  const invalid = `Valor de filtro inválido para «${definition.name}».`;
  switch (definition.dataType) {
    case 'number':
      return z
        .string()
        .trim()
        .min(1, invalid)
        .transform(Number)
        .pipe(z.number().finite(invalid)) as z.ZodType<AttributeValue, string>;
    case 'boolean':
      return z.enum(['true', 'false'], { error: invalid }).transform((value) => value === 'true');
    case 'list':
      return z.enum(definition.options as [string, ...string[]], { error: invalid });
    case 'text':
      return z.string().trim().min(1, invalid);
  }
}

const nonNegativeCents = centsSchema.min(0, 'El monto no puede ser negativo.');
const articleName = z
  .string()
  .trim()
  .min(1, 'Escribe un nombre.')
  .max(ARTICLE_NAME_MAX, `Usa como máximo ${ARTICLE_NAME_MAX} caracteres.`);
const description = z.string().trim().max(500, 'Usa como máximo 500 caracteres.').nullable();
/** Forma del SKU; el dominio lo normaliza y valida el formato. */
const sku = z
  .string()
  .trim()
  .min(1, 'Escribe el SKU.')
  .max(SKU_MAX, `Usa como máximo ${SKU_MAX} caracteres.`);
const attributeValues = z.record(z.string(), z.unknown());
const stock = z.number().min(0, 'La existencia no puede ser negativa.');

export const createVariantSchema = z.strictObject({
  sizeId: z.uuid().nullable().default(null),
  sku,
  attributes: attributeValues.default({}),
  averageCost: nonNegativeCents,
  price: nonNegativeCents.nullable(),
  stock,
});
export type CreateVariant = z.infer<typeof createVariantSchema>;

export const createArticleSchema = z.strictObject({
  articleTypeId: z.uuid('Identificador inválido.'),
  name: articleName,
  description: description.default(null),
  stockUnit: stockUnitSchema,
  sold: z.boolean(),
  usedInRecipes: z.boolean(),
  fixedAttributes: attributeValues.default({}),
  variants: z.array(createVariantSchema).min(1, 'Agrega al menos una variante.').max(100),
});
export type CreateArticle = z.infer<typeof createArticleSchema>;

const notEmpty = (patch: object) => Object.keys(patch).length > 0;

/** El tipo y la unidad de existencia no se editan. */
export const updateArticleSchema = z
  .strictObject({
    name: articleName.optional(),
    description: description.optional(),
    sold: z.boolean().optional(),
    usedInRecipes: z.boolean().optional(),
    fixedAttributes: attributeValues.optional(),
    active: z.boolean().optional(),
  })
  .refine(notEmpty, 'Indica al menos un cambio.');
export type UpdateArticle = z.infer<typeof updateArticleSchema>;

export const updateVariantSchema = z
  .strictObject({
    sizeId: z.uuid().nullable().optional(),
    sku: sku.optional(),
    attributes: attributeValues.optional(),
    averageCost: nonNegativeCents.optional(),
    price: nonNegativeCents.nullable().optional(),
    stock: stock.optional(),
    active: z.boolean().optional(),
  })
  .refine(notEmpty, 'Indica al menos un cambio.');
export type UpdateVariant = z.infer<typeof updateVariantSchema>;

const flag = z
  .enum(['true', 'false'], { error: 'Usa true o false.' })
  .transform((value) => value === 'true');

/** `clave:valor`, separado en el primer «:» para que el valor pueda contenerlo. */
const attributeFilter = z.string().transform((raw, context) => {
  const index = raw.indexOf(':');
  const key = index === -1 ? '' : raw.slice(0, index).trim();
  if (key === '') {
    context.addIssue({ code: 'custom', message: 'Usa el formato clave:valor.' });
    return z.NEVER;
  }
  return { key, value: raw.slice(index + 1) };
});

export const articleListQuerySchema = z
  .object({
    sizeId: z.uuid().optional(),
    typeId: z.uuid('Identificador inválido.').optional(),
    q: z.string().trim().max(100).optional(),
    inStock: flag.optional(),
    includeInactive: flag.default(false),
    attr: z
      .union([attributeFilter, z.array(attributeFilter)])
      .transform((value) => (Array.isArray(value) ? value : [value]))
      .optional(),
  })
  .refine((query) => !query.attr || query.typeId, {
    message: 'Para filtrar por atributo elige un tipo.',
    path: ['attr'],
  });
export type ArticleListQuery = z.infer<typeof articleListQuerySchema>;

export const articleParamsSchema = z.object({ id: z.uuid('Identificador inválido.') });
export const variantParamsSchema = z.object({
  id: z.uuid('Identificador inválido.'),
  variantId: z.uuid('Identificador inválido.'),
});

const attributeValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const variantSchema = z.object({
  sizeId: z.uuid().nullable(),
  id: z.uuid(),
  sku: z.string(),
  attributes: z.record(z.string(), attributeValueSchema),
  averageCost: centsSchema,
  price: centsSchema.nullable(),
  stock: z.number(),
  active: z.boolean(),
});
export type ArticleVariant = z.infer<typeof variantSchema>;

const articleBase = {
  id: z.uuid(),
  name: z.string(),
  articleType: z.object({ id: z.uuid(), name: z.string(), usesSize: z.boolean() }),
  stockUnit: stockUnitSchema,
  sold: z.boolean(),
  usedInRecipes: z.boolean(),
  active: z.boolean(),
};

/** Fila de la pantalla 4; los agregados son sobre variantes activas. */
export const articleSummarySchema = z.object({
  ...articleBase,
  variantCount: z.number().int(),
  costFrom: centsSchema.nullable(),
  totalStock: z.number(),
});
export type ArticleSummary = z.infer<typeof articleSummarySchema>;

export const articleDetailSchema = z.object({
  ...articleBase,
  description: z.string().nullable(),
  fixedAttributes: z.record(z.string(), attributeValueSchema),
  /** Activas e inactivas, por orden de tamaño y luego de creación. */
  variants: z.array(variantSchema),
});
export type ArticleDetail = z.infer<typeof articleDetailSchema>;

export const costChangeReasonSchema = z.enum(['initial', 'manual']);
export const costChangeSchema = z.object({
  id: z.uuid(),
  previousCost: centsSchema.nullable(),
  averageCost: centsSchema,
  reason: costChangeReasonSchema,
  changedAt: z.iso.datetime({ offset: true }),
  changedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
});
export type CostChange = z.infer<typeof costChangeSchema>;

/** `details` de 422 `DUPLICATE_SKU` / `DUPLICATE_COMBINATION`: la variante con la que choca. */
export const variantConflictSchema = z.object({ variantId: z.uuid(), active: z.boolean() });
export type VariantConflict = z.infer<typeof variantConflictSchema>;
