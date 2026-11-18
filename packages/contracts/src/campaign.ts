import {
  CAMPAIGN_STATUSES,
  PERSISTED_CAMPAIGN_STATUSES,
  type CampaignStatus,
  type PersistedCampaignStatus,
} from '@moss/domain';
import { z } from 'zod';

/** Estados que se guardan en la base. `active` y `closing` se derivan de las fechas (D4). */
export const persistedCampaignStatusSchema = z.enum(PERSISTED_CAMPAIGN_STATUSES);

/** Estado derivado que la API devuelve y la web muestra. */
export const campaignStatusSchema = z.enum(CAMPAIGN_STATUSES);

// El dominio es el único dueño de los estados y de sus etiquetas en español.
export type { CampaignStatus, PersistedCampaignStatus };
export { campaignStatusLabels } from '@moss/domain';
