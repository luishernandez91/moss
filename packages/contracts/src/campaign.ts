import {
  CAMPAIGN_STATUSES,
  PERSISTED_CAMPAIGN_STATUSES,
  type CampaignStatus,
  type PersistedCampaignStatus,
} from '@moss/domain';
import { z } from 'zod';
import { businessDateSchema, centsSchema, percentSchema } from './common.js';

/** Estados que se guardan en la base. `active` y `closing` se derivan de las fechas (D4). */
export const persistedCampaignStatusSchema = z.enum(PERSISTED_CAMPAIGN_STATUSES);

/** Estado derivado que la API devuelve y la web muestra. */
export const campaignStatusSchema = z.enum(CAMPAIGN_STATUSES);

// El dominio es el único dueño de los estados y de sus etiquetas en español.
export type { CampaignStatus, PersistedCampaignStatus };
export { campaignStatusLabels } from '@moss/domain';

// K1 · Campañas: modelo y lista (pantalla 11) y API mínima de alta y programación.

export const campaignTypeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Evento sí, temporada no: las campañas de un tipo que lo permite pueden empalmarse. */
  allowsOverlap: z.boolean(),
});
export type CampaignType = z.infer<typeof campaignTypeSchema>;

const campaignName = z
  .string()
  .trim()
  .min(1, 'Escribe un nombre.')
  .max(120, 'Usa como máximo 120 caracteres.');

/** Alta de un borrador (§5: un borrador no valida fechas). La reinversión es un porcentaje entero. */
export const createCampaignSchema = z.strictObject({
  name: campaignName,
  campaignTypeId: z.uuid('Identificador inválido.'),
  budget: centsSchema.min(0, 'El presupuesto no puede ser negativo.'),
  startDate: businessDateSchema.nullable().default(null),
  endDate: businessDateSchema.nullable().default(null),
  reinvestmentPercent: percentSchema.default(0),
  notes: z
    .string()
    .trim()
    .max(1000, 'Usa como máximo 1000 caracteres.')
    .nullable()
    .default(null)
    .transform((notes) => (notes === '' ? null : notes)),
});
export type CreateCampaign = z.infer<typeof createCampaignSchema>;

/** Motivo opcional para la bitácora (§8 regla 11). */
export const scheduleCampaignSchema = z.strictObject({
  reason: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .default(null)
    .transform((reason) => (reason === '' ? null : reason)),
});
export type ScheduleCampaign = z.infer<typeof scheduleCampaignSchema>;

export const campaignListQuerySchema = z.object({
  status: campaignStatusSchema.optional(),
  awaitingClose: z
    .enum(['true', 'false'], { error: 'Usa true o false.' })
    .transform((value) => value === 'true')
    .default(false),
});
export type CampaignListQuery = z.infer<typeof campaignListQuerySchema>;

export const campaignParamsSchema = z.object({ id: z.uuid('Identificador inválido.') });

export const campaignSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: campaignTypeSchema,
  /** Estado derivado con la fecha de hoy en America/Mexico_City. */
  status: campaignStatusSchema,
  budget: centsSchema,
  startDate: businessDateSchema.nullable(),
  endDate: businessDateSchema.nullable(),
  reinvestmentPercent: z.number().int(),
  notes: z.string().nullable(),
});
export type Campaign = z.infer<typeof campaignSchema>;

/** `details` del 409 `OVERLAP`: las campañas con las que choca, para nombrarlas y formatear fechas. */
export const campaignOverlapDetailsSchema = z.object({
  conflicts: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      type: z.string(),
      startDate: businessDateSchema,
      endDate: businessDateSchema,
    }),
  ),
});
export type CampaignOverlapDetails = z.infer<typeof campaignOverlapDetailsSchema>;
