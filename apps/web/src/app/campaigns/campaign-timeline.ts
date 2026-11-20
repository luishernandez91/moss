import type { Campaign, CampaignStatus } from '@moss/contracts';

/**
 * Geometría de la línea de tiempo (pantalla 11). Es presentación: ubica barras y meses; las reglas
 * de estado y empalme viven en el dominio. Solo ocupan el calendario las programadas, activas y por
 * cerrar.
 */
const SHOWN: readonly CampaignStatus[] = ['scheduled', 'active', 'closing'];
const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const DAY = 86_400_000;

export type DatedCampaign = Campaign & { startDate: string; endDate: string };

export interface TimelineMonth {
  key: string;
  /** «OCT 2026» en el primer mes y en enero; si no, solo el mes. */
  label: string;
  short: string;
  /** Milisegundos UTC del primer día y del día siguiente al último. */
  start: number;
  end: number;
}

const utc = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`);

export function timelineCampaigns(campaigns: readonly Campaign[]): DatedCampaign[] {
  return campaigns.filter(
    (campaign): campaign is DatedCampaign =>
      SHOWN.includes(campaign.status) && campaign.startDate !== null && campaign.endDate !== null,
  );
}

export function timelineMonths(campaigns: readonly DatedCampaign[]): TimelineMonth[] {
  if (campaigns.length === 0) return [];
  const first = campaigns.reduce(
    (min, c) => (c.startDate < min ? c.startDate : min),
    campaigns[0]!.startDate,
  );
  const last = campaigns.reduce(
    (max, c) => (c.endDate > max ? c.endDate : max),
    campaigns[0]!.endDate,
  );
  let year = Number(first.slice(0, 4));
  let month = Number(first.slice(5, 7)) - 1;
  const lastKey = last.slice(0, 7);
  const months: TimelineMonth[] = [];
  for (;;) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    const short = MONTHS[month]!;
    months.push({
      key,
      short,
      label: months.length === 0 || month === 0 ? `${short} ${year}` : short,
      start: Date.UTC(year, month, 1),
      end: Date.UTC(year, month + 1, 1),
    });
    if (key === lastKey) break;
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
  return months;
}

/** Posición en porcentaje del rango completo; la fecha fin cuenta como día completo. */
export function barPlacement(
  campaign: DatedCampaign,
  months: readonly TimelineMonth[],
): { left: number; width: number } {
  const start = months[0]!.start;
  const total = months[months.length - 1]!.end - start;
  const from = utc(campaign.startDate) - start;
  const to = utc(campaign.endDate) + DAY - start;
  return { left: (from / total) * 100, width: ((to - from) / total) * 100 };
}

const byStart = (a: DatedCampaign, b: DatedCampaign) =>
  a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name, 'es');

/**
 * Una fila por tipo de campaña, en orden alfabético. Cada fila se divide en carriles sin empalmes:
 * los eventos pueden empalmarse y, en un solo carril, sus barras se taparían.
 */
export function timelineRows(
  campaigns: readonly DatedCampaign[],
): { type: Campaign['type']; lanes: DatedCampaign[][] }[] {
  const byType = new Map<string, { type: Campaign['type']; campaigns: DatedCampaign[] }>();
  for (const campaign of campaigns) {
    const row = byType.get(campaign.type.id) ?? { type: campaign.type, campaigns: [] };
    row.campaigns.push(campaign);
    byType.set(campaign.type.id, row);
  }
  return [...byType.values()]
    .sort((a, b) => a.type.name.localeCompare(b.type.name, 'es'))
    .map(({ type, campaigns: rowCampaigns }) => {
      const lanes: DatedCampaign[][] = [];
      for (const campaign of [...rowCampaigns].sort(byStart)) {
        const lane = lanes.find(
          (candidate) => candidate[candidate.length - 1]!.endDate < campaign.startDate,
        );
        if (lane) lane.push(campaign);
        else lanes.push([campaign]);
      }
      return { type, lanes };
    });
}

/** Celular: cada mes con las campañas que lo ocupan. */
export function monthGroups(
  campaigns: readonly DatedCampaign[],
  months: readonly TimelineMonth[],
): { key: string; short: string; campaigns: DatedCampaign[] }[] {
  return months.map((month) => ({
    key: month.key,
    short: month.short,
    campaigns: campaigns
      .filter((c) => utc(c.startDate) < month.end && utc(c.endDate) >= month.start)
      .sort(byStart),
  }));
}
