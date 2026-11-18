/**
 * Empalme de campañas (especificación §5 pantalla 12, §6 y §8 regla 6; AGENTS.md, regla 6).
 * Misma semántica que la restricción de PostgreSQL de K1:
 * `EXCLUDE USING gist (type WITH =, daterange(start_date, end_date, '[]') WITH &&)` para el estado
 * guardado `scheduled`. Rangos cerrados con ambos extremos incluidos y sin reloj: programada, activa
 * y por cerrar participan porque las tres se guardan como `scheduled`.
 */
import { compareDates, type BusinessDate } from './business-date.js';
import {
  assertValidSchedule,
  CampaignStateError,
  type CampaignSchedule,
} from './campaign-status.js';

/**
 * Id del tipo de campaña configurado en la pantalla 24 (ej. `temporada`, `evento`).
 * Se compara con igualdad exacta, como `type WITH =`.
 */
export type CampaignType = string;

/**
 * Campaña que se va a programar, reabrir o cuyas fechas cambian. No lleva estado: todas las acciones
 * que validan empalme la dejan en `scheduled`, así que se valida como programada.
 */
export interface OverlapCandidate {
  /** `null` si la campaña es nueva. Al editar, se excluye a sí misma por id. */
  id: string | null;
  type: CampaignType;
  startDate: BusinessDate | null;
  endDate: BusinessDate | null;
}

/** Campaña existente contra la que se compara. */
export interface OverlapCampaign extends CampaignSchedule {
  id: string;
  name: string;
  type: CampaignType;
}

/** Campaña con la que choca la candidata, con lo necesario para nombrarla en la interfaz. */
export interface CampaignOverlapConflict {
  id: string;
  name: string;
  type: CampaignType;
  startDate: BusinessDate;
  endDate: BusinessDate;
}

export class CampaignOverlapError extends Error {
  override name = 'CampaignOverlapError';
  readonly code = 'OVERLAP' as const;
  constructor(
    readonly conflicts: readonly CampaignOverlapConflict[],
    message: string,
  ) {
    super(message);
  }
}

/** True si los rangos cerrados `[aStart, aEnd]` y `[bStart, bEnd]` comparten al menos un día. */
export function rangesOverlap(
  aStart: BusinessDate,
  aEnd: BusinessDate,
  bStart: BusinessDate,
  bEnd: BusinessDate,
): boolean {
  return compareDates(aStart, bEnd) <= 0 && compareDates(bStart, aEnd) <= 0;
}

/**
 * Valida las fechas de la candidata como programada (D4) y devuelve las campañas programadas del
 * mismo tipo con las que se empalma, ordenadas por inicio, fin, nombre e id. La regla no es
 * configurable. Una campaña participante con fechas inválidas lanza el error de D4: un dato roto
 * debe fallar visible.
 */
export function findCampaignOverlaps(
  candidate: OverlapCandidate,
  existing: readonly OverlapCampaign[],
): CampaignOverlapConflict[] {
  const { start, end } = scheduledDates(candidate);
  const conflicts: CampaignOverlapConflict[] = [];
  for (const other of existing) {
    if (other.status !== 'scheduled') continue;
    if (other.type !== candidate.type) continue;
    if (candidate.id !== null && other.id === candidate.id) continue;
    const dates = existingScheduledDates(other);
    if (!rangesOverlap(start, end, dates.start, dates.end)) continue;
    conflicts.push({
      id: other.id,
      name: other.name,
      type: other.type,
      startDate: dates.start,
      endDate: dates.end,
    });
  }
  return conflicts.sort(compareConflicts);
}

/**
 * Lanza `CampaignOverlapError` (código `OVERLAP`) con todos los empalmes si los hay. El mensaje
 * nombra el primero con fechas ISO; la interfaz formatea las fechas a partir de `conflicts`.
 */
export function assertNoCampaignOverlap(
  candidate: OverlapCandidate,
  existing: readonly OverlapCampaign[],
): void {
  const conflicts = findCampaignOverlaps(candidate, existing);
  const [first] = conflicts;
  if (first === undefined) return;
  const { start, end } = scheduledDates(candidate);
  let message =
    `Las fechas del ${start} al ${end} se empalman con «${first.name}» ` +
    `(del ${first.startDate} al ${first.endDate}), del mismo tipo.`;
  const rest = conflicts.length - 1;
  if (rest > 0) message += ` También con ${rest} ${rest === 1 ? 'campaña' : 'campañas'} más.`;
  throw new CampaignOverlapError(conflicts, message);
}

/** Fechas de una campaña programada, validadas con la regla de D4. */
function scheduledDates(campaign: {
  startDate: BusinessDate | null;
  endDate: BusinessDate | null;
}): { start: BusinessDate; end: BusinessDate } {
  const schedule: CampaignSchedule = {
    status: 'scheduled',
    startDate: campaign.startDate,
    endDate: campaign.endDate,
  };
  assertValidSchedule(schedule);
  // assertValidSchedule garantiza ambas fechas para una campaña programada.
  return { start: schedule.startDate!, end: schedule.endDate! };
}

/**
 * Como `scheduledDates`, pero para una campaña existente: conserva el código de D4 y nombra la
 * campaña rota, para que el error no parezca de las fechas que el usuario está capturando.
 */
function existingScheduledDates(campaign: OverlapCampaign): {
  start: BusinessDate;
  end: BusinessDate;
} {
  try {
    return scheduledDates(campaign);
  } catch (error) {
    if (!(error instanceof CampaignStateError)) throw error;
    throw new CampaignStateError(
      error.code,
      `No se puede validar el empalme: la campaña «${campaign.name}» tiene fechas inválidas. ${error.message}`,
    );
  }
}

function compareConflicts(a: CampaignOverlapConflict, b: CampaignOverlapConflict): number {
  return (
    compareDates(a.startDate, b.startDate) ||
    compareDates(a.endDate, b.endDate) ||
    a.name.localeCompare(b.name, 'es') ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
