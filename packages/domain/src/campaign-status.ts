/**
 * Estados de campaña (especificación §5 y §8, reglas 10 y 11; AGENTS.md, reglas 5 y 7).
 * Solo se guardan borrador, programada, cerrada y cancelada. Activa y por cerrar se derivan
 * de las fechas y de "hoy" en `America/Mexico_City`, sin cron. Funciones puras: el reloj se inyecta.
 */
import { compareDates, isWithin, today, type BusinessDate, type Clock } from './business-date.js';

/** Estados que se guardan en la base. */
export const PERSISTED_CAMPAIGN_STATUSES = ['draft', 'scheduled', 'closed', 'cancelled'] as const;
export type PersistedCampaignStatus = (typeof PERSISTED_CAMPAIGN_STATUSES)[number];

/** Todos los estados, incluidos los derivados `active` y `closing`, en orden de ciclo de vida. */
export const CAMPAIGN_STATUSES = [
  'draft',
  'scheduled',
  'active',
  'closing',
  'closed',
  'cancelled',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** Etiquetas en español para la interfaz y los mensajes de error. */
export const campaignStatusLabels: Readonly<Record<CampaignStatus, string>> = {
  draft: 'Borrador',
  scheduled: 'Programada',
  active: 'Activa',
  closing: 'Por cerrar',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
};

/** Lo mínimo de una campaña para derivar su estado. Un borrador puede no tener fechas. */
export interface CampaignSchedule {
  status: PersistedCampaignStatus;
  startDate: BusinessDate | null;
  endDate: BusinessDate | null;
}

/** Acciones que cambian el estado guardado y quedan en la bitácora. */
export type CampaignAction = 'schedule' | 'unschedule' | 'cancel' | 'close' | 'reopen';

/** Entrada de bitácora. La API agrega usuario y fecha (§8, regla 11). */
export interface CampaignEvent {
  action: CampaignAction;
  reason: string | null;
}

export interface CampaignTransition {
  status: PersistedCampaignStatus;
  event: CampaignEvent;
}

export type CampaignStateErrorCode =
  'MISSING_DATES' | 'INVALID_DATE_RANGE' | 'TRANSITION_NOT_ALLOWED' | 'REASON_REQUIRED';

export class CampaignStateError extends Error {
  override name = 'CampaignStateError';
  constructor(
    readonly code: CampaignStateErrorCode,
    message: string,
  ) {
    super(message);
  }
}

interface TransitionRule {
  from: CampaignStatus;
  to: PersistedCampaignStatus;
  /** Verbo en español para el mensaje de error. */
  verb: string;
  /** Qué estado exige la acción; se agrega al mensaje de error y es cierto desde cualquier estado. */
  hint: string;
}

/** Tabla de transiciones permitidas, sobre el estado derivado. Cualquier otra es un error. */
const TRANSITIONS: Readonly<Record<CampaignAction, TransitionRule>> = {
  schedule: {
    from: 'draft',
    to: 'scheduled',
    verb: 'programar',
    hint: 'solo se programa un borrador',
  },
  unschedule: {
    from: 'scheduled',
    to: 'draft',
    verb: 'regresar a borrador',
    hint: 'solo se regresa a borrador una campaña programada que todavía no empieza',
  },
  cancel: {
    from: 'scheduled',
    to: 'cancelled',
    verb: 'cancelar',
    hint: 'solo se cancela una campaña programada que todavía no empieza',
  },
  close: {
    from: 'closing',
    to: 'closed',
    verb: 'cerrar',
    hint: 'solo se cierra una campaña por cerrar, cuando ya pasó su fecha fin',
  },
  reopen: {
    from: 'closed',
    to: 'scheduled',
    verb: 'reabrir',
    hint: 'solo se reabre una campaña cerrada',
  },
};

function describeStatus(status: CampaignStatus): string {
  return campaignStatusLabels[status].toLowerCase();
}

/**
 * Valida las fechas según el estado guardado. Un borrador se edita "sin validar fechas" (§5);
 * cualquier otro estado necesita inicio y fin, con inicio ≤ fin.
 */
export function assertValidSchedule(campaign: CampaignSchedule): void {
  if (campaign.status === 'draft') return;
  requireDates(campaign);
}

function requireDates(campaign: CampaignSchedule): { start: BusinessDate; end: BusinessDate } {
  const { startDate: start, endDate: end } = campaign;
  if (start === null || end === null) {
    throw new CampaignStateError(
      'MISSING_DATES',
      `Una campaña ${describeStatus(campaign.status)} necesita fecha de inicio y fecha fin.`,
    );
  }
  if (compareDates(start, end) > 0) {
    throw new CampaignStateError(
      'INVALID_DATE_RANGE',
      `La fecha de inicio (${start}) no puede ser posterior a la fecha fin (${end}).`,
    );
  }
  return { start, end };
}

/**
 * Estado derivado: una programada está programada antes del inicio, activa entre inicio y fin
 * (ambos incluidos) y por cerrar después del fin. Los demás estados no cambian con la fecha.
 */
export function deriveCampaignStatus(campaign: CampaignSchedule, clock: Clock): CampaignStatus {
  assertValidSchedule(campaign);
  if (campaign.status !== 'scheduled') return campaign.status;
  const { start, end } = requireDates(campaign);
  const date = today(clock);
  if (compareDates(date, start) < 0) return 'scheduled';
  if (isWithin(date, start, end)) return 'active';
  return 'closing';
}

/**
 * Activa o por cerrar. No lanza: una campaña con fechas inválidas no está abierta.
 * Lo usa la resolución de precio (§8, regla 5) para no aplicar un precio especial con datos rotos.
 */
export function isCampaignOpen(campaign: CampaignSchedule, clock: Clock): boolean {
  try {
    const status = deriveCampaignStatus(campaign, clock);
    return status === 'active' || status === 'closing';
  } catch (error) {
    if (error instanceof CampaignStateError) return false;
    throw error;
  }
}

export interface TransitionOptions {
  clock: Clock;
  /** Motivo para la bitácora. Obligatorio al reabrir; opcional en las demás acciones. */
  reason?: string | null;
}

/**
 * Aplica una acción sobre el estado derivado y devuelve el nuevo estado guardado y la entrada
 * de bitácora. Programar exige ambas fechas (un inicio en el pasado se permite y la campaña queda
 * activa o por cerrar). Reabrir exige motivo y vuelve a `scheduled`, que se deriva según las fechas.
 */
export function transitionCampaign(
  campaign: CampaignSchedule,
  action: CampaignAction,
  options: TransitionOptions,
): CampaignTransition {
  const current = deriveCampaignStatus(campaign, options.clock);
  // La acción puede llegar sin tipo desde la API; una desconocida también es error de dominio.
  if (!Object.hasOwn(TRANSITIONS, action)) {
    throw new CampaignStateError(
      'TRANSITION_NOT_ALLOWED',
      `No se puede aplicar «${String(action)}» a una campaña ${describeStatus(current)}: la acción no existe.`,
    );
  }
  const rule = TRANSITIONS[action];
  if (current !== rule.from) {
    throw new CampaignStateError(
      'TRANSITION_NOT_ALLOWED',
      `No se puede ${rule.verb} una campaña ${describeStatus(current)}: ${rule.hint}.`,
    );
  }
  const reason = options.reason?.trim() || null;
  if (action === 'reopen' && reason === null) {
    throw new CampaignStateError('REASON_REQUIRED', 'Para reabrir una campaña escribe el motivo.');
  }
  if (action === 'schedule') requireDates({ ...campaign, status: rule.to });
  return { status: rule.to, event: { action, reason } };
}

/** Solo se elimina un borrador (§5). Eliminar no es una transición: no queda estado que guardar. */
export function assertCanDelete(campaign: CampaignSchedule, clock: Clock): void {
  const current = deriveCampaignStatus(campaign, clock);
  if (!canDelete(current)) {
    throw new CampaignStateError(
      'TRANSITION_NOT_ALLOWED',
      `No se puede eliminar una campaña ${describeStatus(current)}: solo se elimina un borrador.`,
    );
  }
}

// Permisos por estado derivado (tabla de §5). Cerrada y cancelada son de solo lectura.

/** Editar datos e items. */
export function canEdit(status: CampaignStatus): boolean {
  return status === 'draft' || status === 'scheduled';
}

/** Extender la fecha fin. El empalme se valida aparte (D5). */
export function canExtendEndDate(status: CampaignStatus): boolean {
  return status === 'active';
}

/** Registrar gastos, producción y ventas, incluidos los atrasados. */
export function canRegisterMovements(status: CampaignStatus): boolean {
  return status === 'active' || status === 'closing';
}

export function canClose(status: CampaignStatus): boolean {
  return status === 'closing';
}

export function canClone(status: CampaignStatus): boolean {
  return status === 'closed' || status === 'cancelled';
}

export function canDelete(status: CampaignStatus): boolean {
  return status === 'draft';
}

export function isReadOnly(status: CampaignStatus): boolean {
  return status === 'closed' || status === 'cancelled';
}
