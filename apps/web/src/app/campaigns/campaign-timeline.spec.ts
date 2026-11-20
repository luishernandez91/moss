import type { Campaign } from '@moss/contracts';
import {
  barPlacement,
  monthGroups,
  timelineCampaigns,
  timelineMonths,
  timelineRows,
} from './campaign-timeline';

const type = (name: string, allowsOverlap = false) => ({
  id: `00000000-0000-4000-8000-0000000000${name === 'Temporada' ? '01' : '02'}`,
  name,
  allowsOverlap,
});
const campaign = (overrides: Partial<Campaign>): Campaign => ({
  id: '00000000-0000-4000-8000-000000000a01',
  name: 'Nochebuena 2026',
  type: type('Temporada'),
  status: 'active',
  budget: 300000,
  startDate: '2026-11-01',
  endDate: '2026-12-24',
  reinvestmentPercent: 0,
  notes: null,
  ...overrides,
});
const campaigns: Campaign[] = [
  campaign({}),
  campaign({
    id: 'b',
    name: 'Día de Muertos',
    status: 'closing',
    startDate: '2026-10-15',
    endDate: '2026-11-02',
  }),
  campaign({
    id: 'c',
    name: 'Suculentas para eventos',
    type: type('Evento', true),
    startDate: '2026-11-10',
    endDate: '2026-12-20',
  }),
  campaign({
    id: 'd',
    name: 'Reyes 2027',
    status: 'scheduled',
    startDate: '2027-01-02',
    endDate: '2027-01-06',
  }),
  campaign({
    id: 'e',
    name: 'Borrador',
    status: 'draft',
    startDate: '2026-12-01',
    endDate: '2026-12-05',
  }),
  campaign({
    id: 'f',
    name: 'Cerrada',
    status: 'closed',
    startDate: '2026-06-01',
    endDate: '2026-06-30',
  }),
  campaign({
    id: 'g',
    name: 'Cancelada',
    status: 'cancelled',
    startDate: '2026-12-01',
    endDate: '2026-12-02',
  }),
];

describe('línea de tiempo de campañas', () => {
  it('solo muestra programadas, activas y por cerrar', () => {
    expect(timelineCampaigns(campaigns).map((c) => c.name)).toEqual([
      'Nochebuena 2026',
      'Día de Muertos',
      'Suculentas para eventos',
      'Reyes 2027',
    ]);
  });

  it('cubre los meses de la primera a la última campaña; el año aparece en el primer mes y en enero', () => {
    expect(timelineMonths(timelineCampaigns(campaigns)).map((m) => m.label)).toEqual([
      'OCT 2026',
      'NOV',
      'DIC',
      'ENE 2027',
    ]);
    expect(timelineMonths([])).toEqual([]);
  });

  it('agrupa por tipo y coloca cada barra según sus días dentro del rango', () => {
    const shown = timelineCampaigns(campaigns);
    const months = timelineMonths(shown);
    expect(
      timelineRows(shown).map((row) => [
        row.type.name,
        row.lanes.map((lane) => lane.map((c) => c.name)),
      ]),
    ).toEqual([
      ['Evento', [['Suculentas para eventos']]],
      // Día de Muertos termina el 2 nov y Nochebuena empieza el 1 nov: no caben en el mismo carril.
      ['Temporada', [['Día de Muertos', 'Reyes 2027'], ['Nochebuena 2026']]],
    ]);
    // Rango: 1 oct 2026 – 31 ene 2027 = 123 días. Nochebuena empieza el día 31 y dura 54 días.
    const placement = barPlacement(shown[0]!, months);
    expect(placement.left).toBeCloseTo((31 / 123) * 100, 5);
    expect(placement.width).toBeCloseTo((54 / 123) * 100, 5);
  });

  it('en celular lista por mes las campañas que lo ocupan', () => {
    const shown = timelineCampaigns(campaigns);
    expect(
      monthGroups(shown, timelineMonths(shown)).map((g) => [
        g.short,
        g.campaigns.map((c) => c.name),
      ]),
    ).toEqual([
      ['OCT', ['Día de Muertos']],
      ['NOV', ['Día de Muertos', 'Nochebuena 2026', 'Suculentas para eventos']],
      ['DIC', ['Nochebuena 2026', 'Suculentas para eventos']],
      ['ENE', ['Reyes 2027']],
    ]);
  });

  it('los eventos empalmados van en carriles separados para no taparse', () => {
    const evento = type('Evento', true);
    const events = timelineCampaigns([
      campaign({
        id: 'e1',
        name: 'Boda',
        type: evento,
        startDate: '2026-12-01',
        endDate: '2026-12-10',
      }),
      campaign({
        id: 'e2',
        name: 'Bautizo',
        type: evento,
        startDate: '2026-12-05',
        endDate: '2026-12-06',
      }),
      campaign({
        id: 'e3',
        name: 'Posada',
        type: evento,
        startDate: '2026-12-11',
        endDate: '2026-12-12',
      }),
    ]);
    expect(timelineRows(events)[0]!.lanes.map((lane) => lane.map((c) => c.name))).toEqual([
      ['Boda', 'Posada'],
      ['Bautizo'],
    ]);
  });
});
