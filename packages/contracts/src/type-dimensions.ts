import { z } from 'zod';
import { createAttributeSchema } from './article-types.js';

/** Operación única: definición nueva + valor para los registros que existen al guardar. */
export const createAttributeDimensionSchema = z.strictObject({
  attribute: createAttributeSchema,
  initialValue: z.union([z.string(), z.number().finite(), z.boolean()]),
});
export type CreateAttributeDimension = z.infer<typeof createAttributeDimensionSchema>;
export const enableTypeSizeSchema = z.strictObject({ initialSizeId: z.uuid('Elige un tamaño.') });
export type EnableTypeSize = z.infer<typeof enableTypeSizeSchema>;
