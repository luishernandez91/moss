import { describe, expect, it } from 'vitest';
import { businessDate, type Clock } from './business-date.js';
import { isAwaitingClose, listCampaigns, type ListableCampaign } from './campaign-list.js';

const d = businessDate;
/** 20 nov 2026 a mediodía en Ciudad de México. */
const clock: Clock = { now: () => new Date('2026-11-20T18:00:00Z') };

const base = (overrides: Partial<ListableCampaign>): ListableCampaign => ({
  id: 'x',
  name: 'X',
  status: 'scheduled',
  startDate: d('2026-11-01'),
  endDate: d('2026-12-24'),
  ...overrides,
});

const campaigns: ListableCampaign[] = [
  base({ id: 'reyes', name: 'Reyes 2027', startDate: d('2027-01-02'), endDate: d('2027-01-06') }),
  base({
    id: 'borrador',
    name: 'Borrador sin fechas',
    status: 'draft',
    startDate: null,
    endDate: null,
  }),
  base({
    id: 'muertos',
    name: 'Día de Muertos',
    startDate: d('2026-10-15'),
    endDate: d('2026-11-02'),
  }),
  base({ id: 'nochebuena', name: 'Nochebuena 2026' }),
  base({
    id: 'suculentas',
    name: 'Suculentas para eventos',
    startDate: d('2026-11-10'),
    endDate: d('2026-12-20'),
  }),
  base({
    id: 'cerrada',
    name: 'Verano 2026',
    status: 'closed',
    startDate: d('2026-06-01'),
    endDate: d('2026-08-31'),
  }),
  base({
    id: 'cancelada',
    name: 'Feria cancelada',
    status: 'cancelled',
    startDate: d('2026-09-01'),
    endDate: d('2026-09-05'),
  }),
  base({
    id: 'borrador2',
    name: 'Borrador con fechas',
    status: 'draft',
    startDate: d('2026-12-01'),
    endDate: d('2026-12-02'),
  }),
];

describe('listCampaigns', () => {
  it('deriva el estado con el reloj y ordena: activas, por cerrar, programadas, borradores, cerradas y canceladas', () => {
    expect(listCampaigns(campaigns, clock).map((c) => [c.id, c.status])).toEqual([
      ['nochebuena', 'active'],
      ['suculentas', 'active'],
      ['muertos', 'closing'],
      ['reyes', 'scheduled'],
      ['borrador2', 'draft'],
      ['borrador', 'draft'],
      ['cerrada', 'closed'],
      ['cancelada', 'cancelled'],
    ]);
  });

  it('filtra por estado derivado', () => {
    expect(listCampaigns(campaigns, clock, { status: 'active' }).map((c) => c.id)).toEqual([
      'nochebuena',
      'suculentas',
    ]);
    expect(listCampaigns(campaigns, clock, { status: 'closing' }).map((c) => c.id)).toEqual([
      'muertos',
    ]);
  });

  it('filtra las que aún no se cierran (editor de participación de S1)', () => {
    expect(listCampaigns(campaigns, clock, { awaitingClose: true }).map((c) => c.id)).toEqual([
      'nochebuena',
      'suculentas',
      'muertos',
      'reyes',
      'borrador2',
      'borrador',
    ]);
  });

  it('el día se calcula en America/Mexico_City', () => {
    // 05:30 UTC del 2 nov es todavía 1 nov en Ciudad de México: Día de Muertos sigue activa.
    const lateNight: Clock = { now: () => new Date('2026-11-02T05:30:00Z') };
    expect(listCampaigns([campaigns[2]!], lateNight)[0]!.status).toBe('active');
    const nextDay: Clock = { now: () => new Date('2026-11-03T06:30:00Z') };
    expect(listCampaigns([campaigns[2]!], nextDay)[0]!.status).toBe('closing');
  });

  it('no muta la entrada', () => {
    const copy = structuredClone(campaigns);
    listCampaigns(campaigns, clock);
    expect(campaigns).toEqual(copy);
  });
});

describe('isAwaitingClose', () => {
  it('borrador, programada, activa y por cerrar esperan cierre; cerrada y cancelada no', () => {
    expect(
      (['draft', 'scheduled', 'active', 'closing', 'closed', 'cancelled'] as const).map(
        isAwaitingClose,
      ),
    ).toEqual([true, true, true, true, false, false]);
  });
});
