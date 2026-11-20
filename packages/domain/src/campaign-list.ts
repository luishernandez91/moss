/**
 * Lista de campañas (pantalla 11): estado derivado con el reloj (D4) y orden de presentación.
 * Pura; la API la usa para filtrar en memoria (el volumen real son decenas de campañas).
 */
import type { BusinessDate, Clock } from './business-date.js';
import {
  deriveCampaignStatus,
  type CampaignStatus,
  type PersistedCampaignStatus,
} from './campaign-status.js';

export interface ListableCampaign {
  id: string;
  name: string;
  status: PersistedCampaignStatus;
  startDate: BusinessDate | null;
  endDate: BusinessDate | null;
}

export interface ListFilter {
  /** Estado derivado. */
  status?: CampaignStatus;
  /** Solo las que aún no se cierran: borrador, programada, activa y por cerrar. */
  awaitingClose?: boolean;
}

/** Primero lo que está en curso, al final lo terminado. */
const ORDER: readonly CampaignStatus[] = [
  'active',
  'closing',
  'scheduled',
  'draft',
  'closed',
  'cancelled',
];

/** Una campaña cancelada nunca se cierra, así que tampoco espera cierre. */
export function isAwaitingClose(status: CampaignStatus): boolean {
  return status !== 'closed' && status !== 'cancelled';
}

/**
 * Deriva el estado de cada campaña, filtra y ordena por estado (activas, por cerrar, programadas,
 * borradores, cerradas, canceladas), luego por fecha de inicio (sin fecha al final) y nombre.
 */
export function listCampaigns<T extends ListableCampaign>(
  campaigns: readonly T[],
  clock: Clock,
  filter: ListFilter = {},
): (Omit<T, 'status'> & { status: CampaignStatus })[] {
  return campaigns
    .map((campaign) => ({ ...campaign, status: deriveCampaignStatus(campaign, clock) }))
    .filter((campaign) => filter.status === undefined || campaign.status === filter.status)
    .filter((campaign) => !filter.awaitingClose || isAwaitingClose(campaign.status))
    .sort(
      (a, b) =>
        ORDER.indexOf(a.status) - ORDER.indexOf(b.status) ||
        compareOptionalDates(a.startDate, b.startDate) ||
        a.name.localeCompare(b.name, 'es') ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

function compareOptionalDates(a: BusinessDate | null, b: BusinessDate | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}
