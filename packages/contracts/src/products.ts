/**
 * Contratos de productos y recetas (C4, pantallas 7 y 8). Solo forma: las reglas que cruzan
 * registros (árbol, oferta efectiva, sustituciones, referencias) son de `product-catalog` en dominio.
 */
import {
  COMPONENT_CONCEPT_MAX,
  PRODUCT_NAME_MAX,
  QUANTITY_DECIMALS_MAX,
  QUANTITY_MAX,
  RECIPE_CATEGORIES,
} from '@moss/domain';
import { z } from 'zod';
import { centsSchema } from './common.js';

export type { RecipeCategory, SizeCostStatus } from '@moss/domain';

const uuid = () => z.uuid('Identificador inválido.');
const version = z.number().int().nonnegative();
const flag = z
  .enum(['true', 'false'], { error: 'Usa true o false.' })
  .transform((value) => value === 'true');
const nonNegativeCents = centsSchema.min(0, 'El monto no puede ser negativo.');
const productName = z
  .string()
  .trim()
  .min(1, 'Escribe un nombre.')
  .max(PRODUCT_NAME_MAX, `Usa como máximo ${PRODUCT_NAME_MAX} caracteres.`);
const concept = z
  .string()
  .trim()
  .min(1, 'Escribe un concepto.')
  .max(COMPONENT_CONCEPT_MAX, `Usa como máximo ${COMPONENT_CONCEPT_MAX} caracteres.`);

function unique<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

/** Heredar la oferta del padre (o sin restricción en la raíz) o una lista explícita. */
export const sizeOfferSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('inherit') }),
  z.strictObject({
    mode: z.literal('explicit'),
    sizeIds: z
      .array(uuid())
      .min(1, 'Elige al menos un tamaño o hereda los tamaños.')
      .max(50)
      .refine(unique, 'No repitas tamaños.'),
  }),
]);
export type SizeOfferInput = z.infer<typeof sizeOfferSchema>;

export const createProductSchema = z.strictObject({
  name: productName,
  parentId: uuid().nullable().default(null),
  sizeOffer: sizeOfferSchema.default({ mode: 'inherit' }),
});
export type CreateProduct = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .strictObject({
    version,
    name: productName.optional(),
    parentId: uuid().nullable().optional(),
    sizeOffer: sizeOfferSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (patch) => Object.keys(patch).some((key) => key !== 'version'),
    'Indica al menos un cambio.',
  );
export type UpdateProduct = z.infer<typeof updateProductSchema>;

/** Precio general por tamaño. Un tamaño que no aparece queda sin precio (null, sin herencia). */
export const productPricesSchema = z.strictObject({
  version,
  prices: z
    .array(z.strictObject({ sizeId: uuid(), price: nonNegativeCents }))
    .max(50)
    .refine((prices) => unique(prices.map((price) => price.sizeId)), 'Un precio por tamaño.'),
});
export type ProductPricesInput = z.infer<typeof productPricesSchema>;

const quantity = z
  .number({ error: 'Escribe una cantidad.' })
  .positive('La cantidad debe ser mayor que 0.')
  .max(QUANTITY_MAX)
  .refine((value) => {
    const scaled = value * 10 ** QUANTITY_DECIMALS_MAX;
    return Math.abs(scaled - Math.round(scaled)) < 1e-6;
  }, `Usa como máximo ${QUANTITY_DECIMALS_MAX} decimales.`);

/** Un valor para todos los tamaños (`sizeId` null) o uno por tamaño, sin mezclar ni repetir. */
function valuesSchema<T extends z.ZodType>(value: T) {
  return z
    .array(value)
    .min(1, 'Indica al menos un valor.')
    .max(50)
    .refine((values) => {
      const sizeIds = values.map((entry) => (entry as { sizeId: string | null }).sizeId);
      return sizeIds.includes(null) ? values.length === 1 : unique(sizeIds);
    }, 'Indica un valor para todos los tamaños o uno por tamaño, sin repetirlos.');
}

export const variantSizeSchema = z.discriminatedUnion('match', [
  z.strictObject({ match: z.literal('produced') }),
  z.strictObject({ match: z.literal('size'), sizeId: uuid() }),
]);

const attributeValue = z.union([z.string().min(1), z.number(), z.boolean()]);
const componentBase = {
  /** Sin id: componente nuevo. Con id: el componente existente conserva su identidad. */
  id: uuid().optional(),
  category: z.enum(RECIPE_CATEGORIES).default('material'),
  replacesComponentId: uuid().nullable().default(null),
};

export const articleComponentInputSchema = z.strictObject({
  ...componentBase,
  kind: z.literal('article'),
  articleId: uuid(),
  variantId: uuid().nullable().default(null),
  attributeFilter: z.record(z.string().min(1).max(60), attributeValue).default({}),
  variantSize: variantSizeSchema.nullable().default(null),
  concept: concept.nullable().default(null),
  values: valuesSchema(z.strictObject({ sizeId: uuid().nullable(), quantity })),
});

export const fixedComponentInputSchema = z.strictObject({
  ...componentBase,
  kind: z.literal('fixed'),
  concept,
  values: valuesSchema(z.strictObject({ sizeId: uuid().nullable(), amount: nonNegativeCents })),
});

export const recipeComponentInputSchema = z.discriminatedUnion('kind', [
  articleComponentInputSchema,
  fixedComponentInputSchema,
]);
export type RecipeComponentInput = z.infer<typeof recipeComponentInputSchema>;

/** Receta propia completa, en orden. Los componentes omitidos se quitan. */
export const recipeSchema = z.strictObject({
  version,
  components: z
    .array(recipeComponentInputSchema)
    .max(100)
    .refine(
      (components) => unique(components.flatMap((component) => component.id ?? [])),
      'Un componente aparece dos veces.',
    ),
});
export type RecipeInput = z.infer<typeof recipeSchema>;

export const productParamsSchema = z.object({ id: uuid() });
export const productListQuerySchema = z.object({ includeInactive: flag.default(false) });

/** `componente:variante`, ambos UUID. */
const choice = z.string().transform((raw, context) => {
  const [componentId, variantId, ...rest] = raw.split(':');
  const parsed = z.tuple([z.uuid(), z.uuid()]).safeParse([componentId, variantId]);
  if (rest.length > 0 || !parsed.success) {
    context.addIssue({ code: 'custom', message: 'Usa el formato componente:variante.' });
    return z.NEVER;
  }
  return { componentId: parsed.data[0], variantId: parsed.data[1] };
});

export const productCostQuerySchema = z
  .object({
    sizeId: uuid(),
    choice: z
      .union([choice, z.array(choice)])
      .transform((value) => (Array.isArray(value) ? value : [value]))
      .optional(),
  })
  .transform(({ sizeId, choice: choices = [] }, context) => {
    if (!unique(choices.map((entry) => entry.componentId))) {
      context.addIssue({
        code: 'custom',
        message: 'Elige una sola variante por componente.',
        path: ['choice'],
      });
      return z.NEVER;
    }
    return {
      sizeId,
      choices: Object.fromEntries(choices.map((entry) => [entry.componentId, entry.variantId])),
    };
  });
export type ProductCostQuery = z.infer<typeof productCostQuerySchema>;

// --- Respuestas ---------------------------------------------------------------------------

const attributeValues = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));
const marginWarning = z.enum(['below_cost', 'below_min_margin']).nullable();
const apiErrorShape = z.object({ code: z.string(), message: z.string() });

export const sizeCostSchema = z.object({
  sizeId: z.uuid(),
  status: z.enum(['ok', 'needs_choice', 'error']),
  cost: centsSchema.nullable(),
  price: centsSchema.nullable(),
  marginPercent: z.number().nullable(),
  warning: marginWarning,
  error: apiErrorShape.nullable(),
});
export type SizeCostView = z.infer<typeof sizeCostSchema>;

const sizeOfferView = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('inherit') }),
  z.object({ mode: z.literal('explicit'), sizeIds: z.array(z.uuid()) }),
]);

export const productListItemSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  name: z.string(),
  active: z.boolean(),
  version: z.number().int(),
  /** 1 = raíz; máximo 3. */
  depth: z.number().int().min(1).max(3),
  sizeOffer: sizeOfferView,
  /** Producto que define la oferta efectiva; null = sin restricción. */
  sizeOfferFrom: z.uuid().nullable(),
  /** Nombres de los componentes propios, en orden (resumen de la receta base). */
  componentNames: z.array(z.string()),
  sizes: z.array(sizeCostSchema),
});
export type ProductListItem = z.infer<typeof productListItemSchema>;

export const recipeComponentViewSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  kind: z.enum(['article', 'fixed']),
  category: z.enum(RECIPE_CATEGORIES),
  /** Concepto o, si no tiene, nombre del artículo. */
  name: z.string(),
  concept: z.string().nullable(),
  articleId: z.uuid().nullable(),
  articleName: z.string().nullable(),
  articleActive: z.boolean().nullable(),
  stockUnit: z.string().nullable(),
  variantId: z.uuid().nullable(),
  variantSku: z.string().nullable(),
  variantActive: z.boolean().nullable(),
  attributeFilter: attributeValues,
  variantSize: variantSizeSchema.nullable(),
  replacesComponentId: z.uuid().nullable(),
  values: z.array(
    z.object({
      sizeId: z.uuid().nullable(),
      quantity: z.number().nullable(),
      amount: centsSchema.nullable(),
    }),
  ),
});
export type RecipeComponentView = z.infer<typeof recipeComponentViewSchema>;

const productRef = z.object({ id: z.uuid(), name: z.string(), active: z.boolean() });

export const productDetailSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  name: z.string(),
  active: z.boolean(),
  version: z.number().int(),
  /** Raíz → padre. */
  ancestors: z.array(productRef),
  children: z.array(productRef),
  sizeOffer: sizeOfferView,
  sizeOfferFrom: z.uuid().nullable(),
  /** Tamaños que se muestran, en el orden del catálogo. */
  sizes: z.array(
    z.object({ id: z.uuid(), key: z.string(), label: z.string(), active: z.boolean() }),
  ),
  prices: z.array(z.object({ sizeId: z.uuid(), price: centsSchema })),
  components: z.array(recipeComponentViewSchema),
  /** Componentes de los ancestros, del padre hacia la raíz. */
  inherited: z.array(recipeComponentViewSchema.extend({ productName: z.string() })),
});
export type ProductDetail = z.infer<typeof productDetailSchema>;

export const productCostSchema = z.object({
  productId: z.uuid(),
  sizeId: z.uuid(),
  lines: z.array(
    z.object({
      componentId: z.uuid(),
      concept: z.string(),
      kind: z.enum(['article', 'fixed']),
      category: z.enum(RECIPE_CATEGORIES),
      origin: z.enum(['own', 'inherited', 'overridden']),
      sourceProductId: z.uuid().nullable(),
      articleId: z.uuid().nullable(),
      stockUnit: z.string().nullable(),
      variantId: z.uuid().nullable(),
      variantSku: z.string().nullable(),
      variantInactive: z.boolean(),
      quantity: z.number(),
      unitCost: centsSchema.nullable(),
      subtotal: centsSchema.nullable(),
      replacedBy: z.uuid().nullable(),
    }),
  ),
  total: centsSchema.nullable(),
  pendingChoices: z.array(
    z.object({
      componentId: z.uuid(),
      articleId: z.uuid(),
      candidates: z.array(
        z.object({
          variantId: z.uuid(),
          sku: z.string(),
          sizeId: z.uuid().nullable(),
          attributes: attributeValues,
          unitCost: centsSchema,
        }),
      ),
    }),
  ),
  price: centsSchema.nullable(),
  marginPercent: z.number().nullable(),
  warning: marginWarning,
});
export type ProductCost = z.infer<typeof productCostSchema>;
