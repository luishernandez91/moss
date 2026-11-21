/**
 * Contratos de tipos de artículo y atributos (C1). Validan la forma de peticiones y respuestas;
 * las reglas de negocio (nombres únicos, claves, variante ⇒ requerido) viven en el dominio.
 */
import {
  ARTICLE_TYPE_NAME_MAX,
  ATTRIBUTE_DATA_TYPES,
  ATTRIBUTE_NAME_MAX,
  ATTRIBUTE_OPTION_MAX,
  ATTRIBUTE_UNIT_MAX,
  type AttributeDataType,
} from '@moss/domain';
import { z } from 'zod';

export type { AttributeDataType };
export { attributeDataTypeLabels } from '@moss/domain';

export const attributeDataTypeSchema = z.enum(ATTRIBUTE_DATA_TYPES);

const typeName = z
  .string()
  .trim()
  .min(1, 'Escribe un nombre.')
  .max(ARTICLE_TYPE_NAME_MAX, `Usa como máximo ${ARTICLE_TYPE_NAME_MAX} caracteres.`);
const attributeName = z
  .string()
  .trim()
  .min(1, 'Escribe un nombre.')
  .max(ATTRIBUTE_NAME_MAX, `Usa como máximo ${ATTRIBUTE_NAME_MAX} caracteres.`);
const unit = z
  .string()
  .trim()
  .max(ATTRIBUTE_UNIT_MAX, `Usa como máximo ${ATTRIBUTE_UNIT_MAX} caracteres.`)
  .nullable();
const options = z
  .array(
    z
      .string()
      .trim()
      .min(1, 'Las opciones no pueden ir vacías.')
      .max(ATTRIBUTE_OPTION_MAX, `Usa como máximo ${ATTRIBUTE_OPTION_MAX} caracteres.`),
  )
  .min(1, 'Agrega al menos una opción.')
  .max(50, 'Usa como máximo 50 opciones.');

export const createArticleTypeSchema = z.strictObject({
  name: typeName,
  usesSize: z.boolean().default(false),
});
export type CreateArticleType = z.infer<typeof createArticleTypeSchema>;
export const updateArticleTypeSchema = z
  .strictObject({
    name: typeName.optional(),
    usesSize: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, 'Indica al menos un cambio.');
export type UpdateArticleType = z.infer<typeof updateArticleTypeSchema>;

const attributeFlags = { name: attributeName, required: z.boolean(), definesVariant: z.boolean() };

export const createAttributeSchema = z.discriminatedUnion('dataType', [
  z.strictObject({ ...attributeFlags, dataType: z.literal('text') }),
  z.strictObject({ ...attributeFlags, dataType: z.literal('number'), unit: unit.optional() }),
  z.strictObject({ ...attributeFlags, dataType: z.literal('list'), options }),
  z.strictObject({ ...attributeFlags, dataType: z.literal('boolean') }),
]);
export type CreateAttribute = z.infer<typeof createAttributeSchema>;

/** Cambios parciales; el tipo de dato no se edita y la clave es inmutable. */
export const updateAttributeSchema = z
  .strictObject({
    name: attributeName.optional(),
    /** Se acepta para que el dominio responda 422 `KEY_IMMUTABLE` si no es la clave actual. */
    key: z.string().trim().min(1).max(80).optional(),
    unit: unit.optional(),
    options: options.optional(),
    required: z.boolean().optional(),
    definesVariant: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, 'Indica al menos un cambio.');
export type UpdateAttribute = z.infer<typeof updateAttributeSchema>;

export const articleTypeParamsSchema = z.object({ id: z.uuid('Identificador inválido.') });
export const attributeParamsSchema = z.object({
  id: z.uuid('Identificador inválido.'),
  attributeId: z.uuid('Identificador inválido.'),
});

export const attributeSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  dataType: attributeDataTypeSchema,
  unit: z.string().nullable(),
  options: z.array(z.string()).nullable(),
  required: z.boolean(),
  definesVariant: z.boolean(),
  active: z.boolean(),
});
export type Attribute = z.infer<typeof attributeSchema>;

export const articleTypeSchema = z.object({
  usesSize: z.boolean(),
  articleCount: z.number().int().nonnegative(),
  id: z.uuid(),
  name: z.string(),
  /** En orden de creación. */
  attributes: z.array(attributeSchema),
});
export type ArticleType = z.infer<typeof articleTypeSchema>;
