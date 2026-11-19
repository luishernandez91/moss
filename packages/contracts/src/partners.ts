import { PARTNER_NAME_MAX, PARTNER_COUNT } from '@moss/domain';
import { z } from 'zod';

export const partnerShareBpsSchema = z
  .number()
  .int()
  .min(0)
  .max(10000)
  .multipleOf(100, 'Usa porcentajes enteros entre 0 y 100.');
export const partnerSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1, 'Escribe un nombre.').max(PARTNER_NAME_MAX),
  shareBps: partnerShareBpsSchema,
  version: z.number().int().min(0).max(2147483647),
});
export const partnersSchema = z.array(partnerSchema);
export const updatePartnersSchema = z.strictObject({
  partners: z.array(partnerSchema).length(PARTNER_COUNT),
});
export type Partner = z.infer<typeof partnerSchema>;
export type UpdatePartners = z.infer<typeof updatePartnersSchema>;
