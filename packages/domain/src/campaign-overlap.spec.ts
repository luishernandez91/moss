import { describe, expect, it } from 'vitest';
import { businessDate } from './business-date.js';
import {
  assertNoCampaignOverlap,
  CampaignOverlapError,
  DEFAULT_OVERLAP_POLICY,
  findCampaignOverlaps,
  rangesOverlap,
  type OverlapCampaign,
  type OverlapCandidate,
} from './campaign-overlap.js';
import { CampaignStateError, type CampaignStateErrorCode } from './campaign-status.js';

const d = businessDate;

/** Nochebuena 2026: temporada programada del 10 al 31 dic 2026. */
const campaign = (overrides: Partial<OverlapCampaign> = {}): OverlapCampaign => ({
  id: 'nochebuena-2026',
  name: 'Nochebuena 2026',
  type: 'temporada',
  status: 'scheduled',
  startDate: d('2026-12-10'),
  endDate: d('2026-12-31'),
  ...overrides,
});

/** Campaña nueva de temporada del 1 al 15 dic 2026. */
const candidate = (overrides: Partial<OverlapCandidate> = {}): OverlapCandidate => ({
  id: null,
  type: 'temporada',
  startDate: d('2026-12-01'),
  endDate: d('2026-12-15'),
  ...overrides,
});

const ids = (conflicts: readonly { id: string }[]) => conflicts.map((conflict) => conflict.id);

function expectStateError(fn: () => unknown, code: CampaignStateErrorCode, message?: RegExp) {
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

function catchOverlap(fn: () => unknown): CampaignOverlapError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(CampaignOverlapError);
    return error as CampaignOverlapError;
  }
  throw new Error('Se esperaba CampaignOverlapError y no se lanzó nada.');
}

describe('rangesOverlap (rangos cerrados, ambos extremos incluidos)', () => {
  it('se empalman si comparten al menos un día', () => {
    expect(rangesOverlap(d('2026-12-01'), d('2026-12-10'), d('2026-12-10'), d('2026-12-31'))).toBe(
      true,
    );
    expect(rangesOverlap(d('2026-12-10'), d('2026-12-31'), d('2026-12-01'), d('2026-12-10'))).toBe(
      true,
    );
  });

  it('no se empalman si una termina el día antes de que empiece la otra', () => {
    expect(rangesOverlap(d('2026-12-01'), d('2026-12-09'), d('2026-12-10'), d('2026-12-31'))).toBe(
      false,
    );
    expect(rangesOverlap(d('2026-12-10'), d('2026-12-31'), d('2026-12-01'), d('2026-12-09'))).toBe(
      false,
    );
  });

  it('rangos de un solo día', () => {
    const day = d('2026-12-20');
    expect(rangesOverlap(day, day, day, day)).toBe(true);
    expect(rangesOverlap(day, day, d('2026-12-21'), d('2026-12-21'))).toBe(false);
  });
});

describe('findCampaignOverlaps', () => {
  it('1–15 dic contra una programada del 10–31 dic del mismo tipo → empalme (§10)', () => {
    expect(findCampaignOverlaps(candidate(), [campaign()])).toEqual([
      {
        id: 'nochebuena-2026',
        name: 'Nochebuena 2026',
        type: 'temporada',
        startDate: '2026-12-10',
        endDate: '2026-12-31',
      },
    ]);
  });

  it('mismo rango, tipos distintos (evento y temporada) → sin empalme (§10)', () => {
    expect(findCampaignOverlaps(candidate({ type: 'evento' }), [campaign()])).toEqual([]);
  });

  it('termina el día que empieza la otra → empalme', () => {
    const conflicts = findCampaignOverlaps(candidate({ endDate: d('2026-12-10') }), [campaign()]);
    expect(ids(conflicts)).toEqual(['nochebuena-2026']);
  });

  it('termina el día anterior → sin empalme', () => {
    expect(findCampaignOverlaps(candidate({ endDate: d('2026-12-09') }), [campaign()])).toEqual([]);
  });

  it('del otro lado: la existente termina el día que empieza la nueva → empalme; el día antes → no', () => {
    const fresh = candidate({ startDate: d('2026-12-01'), endDate: d('2026-12-15') });
    const endsSameDay = campaign({ startDate: d('2026-11-01'), endDate: d('2026-12-01') });
    const endsDayBefore = campaign({ startDate: d('2026-11-01'), endDate: d('2026-11-30') });
    expect(ids(findCampaignOverlaps(fresh, [endsSameDay]))).toEqual(['nochebuena-2026']);
    expect(findCampaignOverlaps(fresh, [endsDayBefore])).toEqual([]);
  });

  it('rango completamente dentro de otro → empalme', () => {
    const inside = candidate({ startDate: d('2026-12-12'), endDate: d('2026-12-20') });
    expect(ids(findCampaignOverlaps(inside, [campaign()]))).toEqual(['nochebuena-2026']);
  });

  it('rango que contiene completamente a otro → empalme', () => {
    const around = candidate({ startDate: d('2026-12-01'), endDate: d('2027-01-15') });
    expect(ids(findCampaignOverlaps(around, [campaign()]))).toEqual(['nochebuena-2026']);
  });

  it('campañas de un solo día que coinciden → empalme', () => {
    const day = d('2026-12-20');
    const event = campaign({
      id: 'boda',
      name: 'Boda',
      type: 'evento',
      startDate: day,
      endDate: day,
    });
    const fresh = candidate({ type: 'evento', startDate: day, endDate: day });
    expect(ids(findCampaignOverlaps(fresh, [event]))).toEqual(['boda']);
    expect(
      findCampaignOverlaps({ ...fresh, startDate: d('2026-12-21'), endDate: d('2026-12-21') }, [
        event,
      ]),
    ).toEqual([]);
  });

  it.each(['draft', 'closed', 'cancelled'] as const)(
    'una campaña %s con las mismas fechas y tipo no choca',
    (status) => {
      const same = candidate({ startDate: d('2026-12-10'), endDate: d('2026-12-31') });
      expect(findCampaignOverlaps(same, [campaign({ status })])).toEqual([]);
    },
  );

  it('borrador, cerrada o cancelada con fechas rotas se ignoran sin validar', () => {
    const broken = [
      campaign({ id: 'a', status: 'draft', startDate: null, endDate: null }),
      campaign({ id: 'b', status: 'closed', endDate: d('2026-12-01') }),
      campaign({ id: 'c', status: 'cancelled', endDate: null }),
    ];
    expect(findCampaignOverlaps(candidate(), broken)).toEqual([]);
  });

  it('una programada con fechas ya pasadas sigue participando: no se usa el reloj', () => {
    const past = campaign({ startDate: d('2020-12-10'), endDate: d('2020-12-31') });
    const fresh = candidate({ startDate: d('2020-12-01'), endDate: d('2020-12-15') });
    expect(ids(findCampaignOverlaps(fresh, [past]))).toEqual(['nochebuena-2026']);
  });

  it('al editar, la campaña no choca consigo misma', () => {
    const editing = candidate({
      id: 'nochebuena-2026',
      startDate: d('2026-12-05'),
      endDate: d('2026-12-31'),
    });
    expect(findCampaignOverlaps(editing, [campaign()])).toEqual([]);
  });

  it('al editar, se excluye solo a sí misma: otra campaña que empalma sí se reporta', () => {
    const editing = candidate({ id: 'nochebuena-2026' });
    const other = campaign({
      id: 'navidad-2026',
      name: 'Navidad 2026',
      startDate: d('2026-12-14'),
      endDate: d('2026-12-25'),
    });
    expect(ids(findCampaignOverlaps(editing, [campaign(), other]))).toEqual(['navidad-2026']);
  });

  it('devuelve todas las que chocan, ordenadas por fecha de inicio', () => {
    const later = campaign({
      id: 'navidad-2026',
      name: 'Navidad 2026',
      startDate: d('2026-12-14'),
      endDate: d('2026-12-25'),
    });
    const earlier = campaign({
      id: 'otono-2026',
      name: 'Otoño 2026',
      startDate: d('2026-11-01'),
      endDate: d('2026-12-02'),
    });
    const unrelated = campaign({ id: 'evento', type: 'evento' });
    const existing = [later, unrelated, campaign(), earlier];
    const conflicts = findCampaignOverlaps(candidate(), existing);
    expect(ids(conflicts)).toEqual(['otono-2026', 'nochebuena-2026', 'navidad-2026']);
    expect(ids(existing)).toEqual(['navidad-2026', 'evento', 'nochebuena-2026', 'otono-2026']);
  });

  it('con el mismo inicio desempata por fecha fin, nombre e id', () => {
    const start = d('2026-12-05');
    const existing = [
      campaign({ id: 'z', name: 'B', startDate: start, endDate: d('2026-12-20') }),
      campaign({ id: 'y', name: 'A', startDate: start, endDate: d('2026-12-20') }),
      campaign({ id: 'x', name: 'A', startDate: start, endDate: d('2026-12-20') }),
      campaign({ id: 'w', name: 'C', startDate: start, endDate: d('2026-12-10') }),
    ];
    expect(ids(findCampaignOverlaps(candidate(), existing))).toEqual(['w', 'x', 'y', 'z']);
  });

  it('con la regla desactivada no reporta empalmes aunque las fechas sean idénticas', () => {
    const same = candidate({ startDate: d('2026-12-10'), endDate: d('2026-12-31') });
    expect(findCampaignOverlaps(same, [campaign()], { policy: { enabled: false } })).toEqual([]);
  });

  it('sin política, la regla está activada', () => {
    expect(DEFAULT_OVERLAP_POLICY).toEqual({ enabled: true });
    expect(ids(findCampaignOverlaps(candidate(), [campaign()], {}))).toEqual(['nochebuena-2026']);
  });

  it('candidata sin fecha fin → el error de D4, no un fallo', () => {
    expectStateError(
      () => findCampaignOverlaps(candidate({ endDate: null }), [campaign()]),
      'MISSING_DATES',
    );
  });

  it('candidata sin fecha de inicio → MISSING_DATES', () => {
    expectStateError(
      () => findCampaignOverlaps(candidate({ startDate: null }), []),
      'MISSING_DATES',
    );
  });

  it('candidata con inicio después del fin → INVALID_DATE_RANGE', () => {
    expectStateError(
      () =>
        findCampaignOverlaps(
          candidate({ startDate: d('2026-12-20'), endDate: d('2026-12-01') }),
          [],
        ),
      'INVALID_DATE_RANGE',
    );
  });

  it('la candidata se valida aunque la regla esté desactivada', () => {
    expectStateError(
      () => findCampaignOverlaps(candidate({ endDate: null }), [], { policy: { enabled: false } }),
      'MISSING_DATES',
    );
  });

  it('una programada del mismo tipo con fechas rotas → el error de D4, nombrando esa campaña', () => {
    expectStateError(
      () => findCampaignOverlaps(candidate(), [campaign({ endDate: null })]),
      'MISSING_DATES',
      /^No se puede validar el empalme: la campaña «Nochebuena 2026» tiene fechas inválidas\. /,
    );
    expectStateError(
      () => findCampaignOverlaps(candidate(), [campaign({ startDate: d('2027-01-01') })]),
      'INVALID_DATE_RANGE',
      /«Nochebuena 2026».*\(2027-01-01\).*\(2026-12-31\)/,
    );
  });

  it('el error de fechas de la candidata no nombra a otra campaña', () => {
    expectStateError(
      () => findCampaignOverlaps(candidate({ endDate: null }), [campaign()]),
      'MISSING_DATES',
      /^Una campaña programada necesita fecha de inicio y fecha fin\.$/,
    );
  });

  it('una programada con fechas rotas de otro tipo se ignora', () => {
    expect(
      findCampaignOverlaps(candidate(), [campaign({ type: 'evento', endDate: null })]),
    ).toEqual([]);
  });
});

describe('assertNoCampaignOverlap', () => {
  it('no lanza si no hay empalme', () => {
    expect(() =>
      assertNoCampaignOverlap(candidate({ endDate: d('2026-12-09') }), [campaign()]),
    ).not.toThrow();
  });

  it('no lanza con la regla desactivada', () => {
    expect(() =>
      assertNoCampaignOverlap(candidate(), [campaign()], { policy: { enabled: false } }),
    ).not.toThrow();
  });

  it('lanza OVERLAP con los empalmes y un mensaje que nombra la otra campaña', () => {
    const existing = [campaign()];
    const error = catchOverlap(() => assertNoCampaignOverlap(candidate(), existing));
    expect(error.code).toBe('OVERLAP');
    expect(error.name).toBe('CampaignOverlapError');
    expect(error.conflicts).toEqual(findCampaignOverlaps(candidate(), existing));
    expect(error.message).toBe(
      'Las fechas del 2026-12-01 al 2026-12-15 se empalman con «Nochebuena 2026» ' +
        '(del 2026-12-10 al 2026-12-31), del mismo tipo.',
    );
  });

  it('con varios empalmes nombra el primero y cuenta los demás', () => {
    const navidad = campaign({
      id: 'navidad-2026',
      name: 'Navidad 2026',
      startDate: d('2026-12-14'),
      endDate: d('2026-12-25'),
    });
    const otono = campaign({
      id: 'otono-2026',
      name: 'Otoño 2026',
      startDate: d('2026-11-01'),
      endDate: d('2026-12-02'),
    });

    const two = catchOverlap(() => assertNoCampaignOverlap(candidate(), [navidad, otono]));
    expect(ids(two.conflicts)).toEqual(['otono-2026', 'navidad-2026']);
    expect(two.message).toMatch(/«Otoño 2026» \(del 2026-11-01 al 2026-12-02\)/);
    expect(two.message).toMatch(/También con 1 campaña más\.$/);

    const three = catchOverlap(() =>
      assertNoCampaignOverlap(candidate(), [navidad, campaign(), otono]),
    );
    expect(three.conflicts).toHaveLength(3);
    expect(three.message).toMatch(/También con 2 campañas más\.$/);
  });

  it('candidata sin fecha fin → el error de D4, no OVERLAP', () => {
    expectStateError(
      () => assertNoCampaignOverlap(candidate({ endDate: null }), [campaign()]),
      'MISSING_DATES',
    );
  });
});
