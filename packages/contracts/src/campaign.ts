import { z } from 'zod';

/** Estados que se guardan en la base. `active` y `closing` se derivan de las fechas. */
export const persistedCampaignStatusSchema = z.enum(['draft', 'scheduled', 'closed', 'cancelled']);
export type PersistedCampaignStatus = z.infer<typeof persistedCampaignStatusSchema>;

export const campaignStatusSchema = z.enum([
  'draft',
  'scheduled',
  'active',
  'closing',
  'closed',
  'cancelled',
]);
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;

/** Etiquetas en español para la interfaz. */
export const campaignStatusLabels: Record<CampaignStatus, string> = {
  draft: 'Borrador',
  scheduled: 'Programada',
  active: 'Activa',
  closing: 'Por cerrar',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
};
