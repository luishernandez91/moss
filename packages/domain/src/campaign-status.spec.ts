import { describe, expect, it } from 'vitest';
import { businessDate, type Clock } from './business-date.js';
import {
  assertCanDelete,
  CAMPAIGN_STATUSES,
  campaignStatusLabels,
  CampaignStateError,
  canClone,
  canClose,
  canDelete,
  canEdit,
  canExtendEndDate,
  canRegisterMovements,
  deriveCampaignStatus,
  isCampaignOpen,
  isReadOnly,
  PERSISTED_CAMPAIGN_STATUSES,
  transitionCampaign,
  type CampaignAction,
  type CampaignSchedule,
  type CampaignStateErrorCode,
  type CampaignStatus,
  type PersistedCampaignStatus,
} from './campaign-status.js';

const clockAt = (iso: string): Clock => ({ now: () => new Date(iso) });
/** Mediodía en Ciudad de México (UTC-6) del día indicado. */
const noonOn = (date: string): Clock => clockAt(`${date}T18:00:00Z`);

/** Nochebuena 2026: 1 nov – 24 dic 2026. */
const nochebuena = (status: PersistedCampaignStatus = 'scheduled'): CampaignSchedule => ({
  status,
  startDate: businessDate('2026-11-01'),
  endDate: businessDate('2026-12-24'),
});

const undated = (status: PersistedCampaignStatus = 'draft'): CampaignSchedule => ({
  status,
  startDate: null,
  endDate: null,
});

const BEFORE_START = noonOn('2026-10-31');
const DURING = noonOn('2026-11-18');
const AFTER_END = noonOn('2026-12-25');

function expectError(fn: () => unknown, code: CampaignStateErrorCode, message?: RegExp) {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(CampaignStateError);
  expect((caught as CampaignStateError).code).toBe(code);
  if (message) expect((caught as CampaignStateError).message).toMatch(message);
}

describe('listas de estados', () => {
  it('los persistidos son un subconjunto de los derivados', () => {
    expect(PERSISTED_CAMPAIGN_STATUSES).toEqual(['draft', 'scheduled', 'closed', 'cancelled']);
    expect(CAMPAIGN_STATUSES).toEqual([
      'draft',
      'scheduled',
      'active',
      'closing',
      'closed',
      'cancelled',
    ]);
  });

  it('tiene etiqueta en español para cada estado', () => {
    expect(campaignStatusLabels).toEqual({
      draft: 'Borrador',
      scheduled: 'Programada',
      active: 'Activa',
      closing: 'Por cerrar',
      closed: 'Cerrada',
      cancelled: 'Cancelada',
    });
  });
});

describe('deriveCampaignStatus · Nochebuena 2026', () => {
  it.each<[string, CampaignStatus]>([
    ['2026-10-31', 'scheduled'],
    ['2026-11-01', 'active'],
    ['2026-11-18', 'active'],
    ['2026-12-24', 'active'],
    ['2026-12-25', 'closing'],
  ])('el %s una campaña programada está %s', (date, expected) => {
    expect(deriveCampaignStatus(nochebuena(), noonOn(date))).toBe(expected);
  });

  it('"hoy" se toma en Ciudad de México, no en UTC', () => {
    // 25 dic a las 05:30 UTC todavía es 24 dic en CDMX.
    expect(deriveCampaignStatus(nochebuena(), clockAt('2026-12-25T05:30:00Z'))).toBe('active');
    expect(deriveCampaignStatus(nochebuena(), clockAt('2026-12-25T06:30:00Z'))).toBe('closing');
  });

  it('un borrador sin fechas sigue en borrador', () => {
    expect(deriveCampaignStatus(undated(), DURING)).toBe('draft');
  });

  it.each<PersistedCampaignStatus>(['draft', 'closed', 'cancelled'])(
    'una campaña %s no cambia con la fecha',
    (status) => {
      for (const clock of [BEFORE_START, DURING, AFTER_END]) {
        expect(deriveCampaignStatus(nochebuena(status), clock)).toBe(status);
      }
    },
  );

  it('un borrador no valida fechas: puede tener una sola o el inicio después del fin', () => {
    const onlyStart = { ...undated(), startDate: businessDate('2026-11-01') };
    const reversed = {
      status: 'draft' as const,
      startDate: businessDate('2026-12-24'),
      endDate: businessDate('2026-11-01'),
    };
    expect(deriveCampaignStatus(onlyStart, DURING)).toBe('draft');
    expect(deriveCampaignStatus(reversed, DURING)).toBe('draft');
  });

  it.each<PersistedCampaignStatus>(['scheduled', 'closed', 'cancelled'])(
    'una campaña %s sin fechas es un error de dominio',
    (status) => {
      expectError(() => deriveCampaignStatus(undated(status), DURING), 'MISSING_DATES');
      expectError(
        () => deriveCampaignStatus({ ...nochebuena(status), endDate: null }, DURING),
        'MISSING_DATES',
      );
    },
  );

  it('una campaña programada con inicio después del fin es un error de dominio', () => {
    const reversed: CampaignSchedule = {
      status: 'scheduled',
      startDate: businessDate('2026-12-24'),
      endDate: businessDate('2026-11-01'),
    };
    expectError(() => deriveCampaignStatus(reversed, DURING), 'INVALID_DATE_RANGE');
  });

  it('acepta una campaña de un solo día', () => {
    const oneDay: CampaignSchedule = {
      status: 'scheduled',
      startDate: businessDate('2026-11-18'),
      endDate: businessDate('2026-11-18'),
    };
    expect(deriveCampaignStatus(oneDay, DURING)).toBe('active');
  });
});

describe('isCampaignOpen', () => {
  it('es true solo en activa o por cerrar', () => {
    expect(isCampaignOpen(nochebuena(), BEFORE_START)).toBe(false);
    expect(isCampaignOpen(nochebuena(), DURING)).toBe(true);
    expect(isCampaignOpen(nochebuena(), AFTER_END)).toBe(true);
    expect(isCampaignOpen(nochebuena('closed'), DURING)).toBe(false);
  });

  it('una campaña inválida no está abierta y no lanza', () => {
    expect(isCampaignOpen(undated('scheduled'), DURING)).toBe(false);
  });
});

describe('transitionCampaign · permitidas', () => {
  it('programa un borrador con fechas', () => {
    expect(transitionCampaign(nochebuena('draft'), 'schedule', { clock: BEFORE_START })).toEqual({
      status: 'scheduled',
      event: { action: 'schedule', reason: null },
    });
  });

  it('programa un borrador con inicio en el pasado y queda activa', () => {
    const result = transitionCampaign(nochebuena('draft'), 'schedule', { clock: DURING });
    expect(result.status).toBe('scheduled');
    expect(deriveCampaignStatus({ ...nochebuena(), status: result.status }, DURING)).toBe('active');
  });

  it('regresa a borrador una campaña programada que no ha empezado', () => {
    expect(transitionCampaign(nochebuena(), 'unschedule', { clock: BEFORE_START })).toEqual({
      status: 'draft',
      event: { action: 'unschedule', reason: null },
    });
  });

  it('cancela antes del inicio y guarda el motivo si lo hay', () => {
    expect(
      transitionCampaign(nochebuena(), 'cancel', {
        clock: BEFORE_START,
        reason: '  No hubo planta  ',
      }),
    ).toEqual({ status: 'cancelled', event: { action: 'cancel', reason: 'No hubo planta' } });
  });

  it('un motivo vacío se guarda como null', () => {
    const result = transitionCampaign(nochebuena(), 'cancel', { clock: BEFORE_START, reason: ' ' });
    expect(result.event.reason).toBeNull();
  });

  it('cierra una campaña por cerrar', () => {
    expect(transitionCampaign(nochebuena(), 'close', { clock: AFTER_END })).toEqual({
      status: 'closed',
      event: { action: 'close', reason: null },
    });
  });

  it('reabre una cerrada con motivo y queda por cerrar', () => {
    const result = transitionCampaign(nochebuena('closed'), 'reopen', {
      clock: AFTER_END,
      reason: 'Faltó un gasto de musgo',
    });
    expect(result).toEqual({
      status: 'scheduled',
      event: { action: 'reopen', reason: 'Faltó un gasto de musgo' },
    });
    expect(deriveCampaignStatus({ ...nochebuena(), status: result.status }, AFTER_END)).toBe(
      'closing',
    );
  });
});

describe('transitionCampaign · rechazadas', () => {
  it('programar un borrador sin fechas lanza error', () => {
    expectError(
      () => transitionCampaign(undated(), 'schedule', { clock: DURING }),
      'MISSING_DATES',
      /fecha/,
    );
  });

  it('programar un borrador con una sola fecha lanza error', () => {
    expectError(
      () =>
        transitionCampaign({ ...nochebuena('draft'), endDate: null }, 'schedule', {
          clock: DURING,
        }),
      'MISSING_DATES',
    );
  });

  it('programar un borrador con inicio después del fin lanza error', () => {
    const reversed: CampaignSchedule = {
      status: 'draft',
      startDate: businessDate('2026-12-24'),
      endDate: businessDate('2026-11-01'),
    };
    expectError(
      () => transitionCampaign(reversed, 'schedule', { clock: DURING }),
      'INVALID_DATE_RANGE',
    );
  });

  it('cancelar una campaña activa lanza error', () => {
    expectError(
      () => transitionCampaign(nochebuena(), 'cancel', { clock: DURING }),
      'TRANSITION_NOT_ALLOWED',
      /cancelar.*activa/,
    );
  });

  it('regresar a borrador una campaña activa lanza error', () => {
    expectError(
      () => transitionCampaign(nochebuena(), 'unschedule', { clock: DURING }),
      'TRANSITION_NOT_ALLOWED',
      /regresar a borrador.*activa/,
    );
  });

  it('cerrar una campaña activa lanza error', () => {
    expectError(
      () => transitionCampaign(nochebuena(), 'close', { clock: DURING }),
      'TRANSITION_NOT_ALLOWED',
      /cerrar.*activa/,
    );
  });

  it.each([undefined, '', '   '])('reabrir sin motivo (%j) lanza error', (reason) => {
    expectError(
      () =>
        transitionCampaign(nochebuena('closed'), 'reopen', {
          clock: AFTER_END,
          ...(reason !== undefined && { reason }),
        }),
      'REASON_REQUIRED',
      /motivo/,
    );
  });

  /** Estado derivado de partida y reloj que lo produce. */
  const fixtures: Record<CampaignStatus, [CampaignSchedule, Clock]> = {
    draft: [nochebuena('draft'), DURING],
    scheduled: [nochebuena(), BEFORE_START],
    active: [nochebuena(), DURING],
    closing: [nochebuena(), AFTER_END],
    closed: [nochebuena('closed'), AFTER_END],
    cancelled: [nochebuena('cancelled'), DURING],
  };
  const allowed: Record<CampaignAction, CampaignStatus> = {
    schedule: 'draft',
    unschedule: 'scheduled',
    cancel: 'scheduled',
    close: 'closing',
    reopen: 'closed',
  };
  const actionVerbs: Record<CampaignAction, string> = {
    schedule: 'programar',
    unschedule: 'regresar a borrador',
    cancel: 'cancelar',
    close: 'cerrar',
    reopen: 'reabrir',
  };
  const forbidden = CAMPAIGN_STATUSES.flatMap((status) =>
    (Object.keys(allowed) as CampaignAction[])
      .filter((action) => allowed[action] !== status)
      .map((action) => [status, action] as const),
  );

  it('la matriz cubre todos los pares no permitidos', () => {
    expect(forbidden).toHaveLength(CAMPAIGN_STATUSES.length * 5 - 5);
  });

  it.each(forbidden)('desde %s no se puede %s', (status, action) => {
    const [campaign, clock] = fixtures[status];
    expectError(
      () => transitionCampaign(campaign, action, { clock, reason: 'motivo' }),
      'TRANSITION_NOT_ALLOWED',
      new RegExp(`${actionVerbs[action]}.*${campaignStatusLabels[status].toLowerCase()}`),
    );
  });
});

describe('transitionCampaign · mensajes', () => {
  it.each<[CampaignSchedule, Clock, CampaignAction, RegExp]>([
    [nochebuena('draft'), BEFORE_START, 'cancel', /solo se cancela una campaña programada/],
    [
      nochebuena('draft'),
      BEFORE_START,
      'unschedule',
      /solo se regresa a borrador una campaña programada/,
    ],
    [nochebuena('draft'), AFTER_END, 'close', /solo se cierra una campaña por cerrar/],
    [nochebuena('closed'), AFTER_END, 'close', /solo se cierra una campaña por cerrar/],
    [nochebuena('cancelled'), BEFORE_START, 'cancel', /solo se cancela una campaña programada/],
  ])(
    'el motivo del rechazo nombra el estado que exige la acción (%#)',
    (campaign, clock, action, hint) => {
      expectError(
        () => transitionCampaign(campaign, action, { clock }),
        'TRANSITION_NOT_ALLOWED',
        hint,
      );
    },
  );

  it('una acción desconocida es error de dominio, no TypeError', () => {
    expectError(
      () => transitionCampaign(nochebuena('draft'), 'delete' as CampaignAction, { clock: DURING }),
      'TRANSITION_NOT_ALLOWED',
      /«delete».*borrador.*no existe/,
    );
  });
});

describe('assertCanDelete', () => {
  it('permite eliminar un borrador, con o sin fechas', () => {
    expect(() => assertCanDelete(undated(), DURING)).not.toThrow();
    expect(() => assertCanDelete(nochebuena('draft'), DURING)).not.toThrow();
  });

  it.each<[CampaignSchedule, Clock, string]>([
    [nochebuena(), BEFORE_START, 'programada'],
    [nochebuena(), DURING, 'activa'],
    [nochebuena(), AFTER_END, 'por cerrar'],
    [nochebuena('closed'), AFTER_END, 'cerrada'],
    [nochebuena('cancelled'), DURING, 'cancelada'],
  ])('no permite eliminar una campaña %#', (campaign, clock, label) => {
    expectError(
      () => assertCanDelete(campaign, clock),
      'TRANSITION_NOT_ALLOWED',
      new RegExp(`eliminar.*${label}`),
    );
  });
});

describe('permisos por estado', () => {
  const table: Record<CampaignStatus, boolean[]> = {
    //          edit   extend register close  clone  delete readOnly
    draft: [true, false, false, false, false, true, false],
    scheduled: [true, false, false, false, false, false, false],
    active: [false, true, true, false, false, false, false],
    closing: [false, false, true, true, false, false, false],
    closed: [false, false, false, false, true, false, true],
    cancelled: [false, false, false, false, true, false, true],
  };

  it.each(CAMPAIGN_STATUSES)('%s', (status) => {
    expect([
      canEdit(status),
      canExtendEndDate(status),
      canRegisterMovements(status),
      canClose(status),
      canClone(status),
      canDelete(status),
      isReadOnly(status),
    ]).toEqual(table[status]);
  });
});
