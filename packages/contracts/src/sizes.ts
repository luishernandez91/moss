import { z } from 'zod';
const key = z.string().trim().min(1).max(40);
const label = z.string().trim().min(1, 'Escribe un nombre.').max(80);
export const createSizeSchema = z.strictObject({ key, label, active: z.boolean().default(true) });
export const updateSizeSchema = z
  .strictObject({ key: key.optional(), label: label.optional(), active: z.boolean().optional() })
  .refine((patch) => Object.keys(patch).length > 0, 'Indica al menos un cambio.');
export const reorderSizesSchema = z.strictObject({ ids: z.array(z.uuid()).max(1000) });
export const sizeParamsSchema = z.object({ id: z.uuid() });
export const sizeListQuerySchema = z.object({
  purpose: z.enum(['manage', 'filter']).default('manage'),
});
export const sizeSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  label: z.string(),
  sortOrder: z.number().int().nonnegative(),
  active: z.boolean(),
  inUse: z.boolean(),
});
export type Size = z.infer<typeof sizeSchema>;
export type CreateSize = z.infer<typeof createSizeSchema>;
export type UpdateSize = z.infer<typeof updateSizeSchema>;
