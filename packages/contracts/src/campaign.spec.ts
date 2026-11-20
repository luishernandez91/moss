import { describe, expect, it } from 'vitest';
import {
  campaignListQuerySchema,
  campaignOverlapDetailsSchema,
  createCampaignSchema,
  scheduleCampaignSchema,
} from './campaign.js';

const typeId = '0a8f8d5e-3c7b-4a35-9b6a-1f7d2d0f5c11';

describe('contratos de campañas', () => {
  it('crear un borrador: fechas opcionales, montos en centavos y reinversión en porcentaje entero', () => {
    expect(
      createCampaignSchema.parse({
        name: ' Nochebuena 2026 ',
        campaignTypeId: typeId,
        budget: 300000,
      }),
    ).toEqual({
      name: 'Nochebuena 2026',
      campaignTypeId: typeId,
      budget: 300000,
      startDate: null,
      endDate: null,
      reinvestmentPercent: 0,
      notes: null,
    });
    const full = createCampaignSchema.parse({
      name: 'Reyes',
      campaignTypeId: typeId,
      budget: 0,
      startDate: '2027-01-02',
      endDate: '2027-01-06',
      reinvestmentPercent: 30,
      notes: '  Tianguis  ',
    });
    expect(full).toMatchObject({
      startDate: '2027-01-02',
      reinvestmentPercent: 30,
      notes: 'Tianguis',
    });
  });

  it('rechaza montos no enteros o negativos, porcentajes decimales, fechas mal escritas y campos de más', () => {
    const base = { name: 'X', campaignTypeId: typeId, budget: 100 };
    for (const bad of [
      { budget: 10.5 },
      { budget: -1 },
      { reinvestmentPercent: 12.5 },
      { reinvestmentPercent: 101 },
      { startDate: '02/01/2027' },
      { status: 'scheduled' },
      { name: '   ' },
    ]) {
      expect(createCampaignSchema.safeParse({ ...base, ...bad }).success).toBe(false);
    }
  });

  it('la lista filtra por estado derivado o por campañas que aún no se cierran', () => {
    expect(campaignListQuerySchema.parse({})).toEqual({ awaitingClose: false });
    expect(campaignListQuerySchema.parse({ status: 'active', awaitingClose: 'true' })).toEqual({
      status: 'active',
      awaitingClose: true,
    });
    expect(campaignListQuerySchema.safeParse({ status: 'activa' }).success).toBe(false);
  });

  it('programar acepta un motivo opcional', () => {
    expect(scheduleCampaignSchema.parse({})).toEqual({ reason: null });
    expect(scheduleCampaignSchema.parse({ reason: ' listo ' })).toEqual({ reason: 'listo' });
  });

  it('los detalles del 409 OVERLAP nombran las campañas con las que choca', () => {
    expect(
      campaignOverlapDetailsSchema.safeParse({
        conflicts: [
          {
            id: typeId,
            name: 'Nochebuena 2026',
            type: typeId,
            startDate: '2026-11-01',
            endDate: '2026-12-24',
          },
        ],
      }).success,
    ).toBe(true);
  });
});
