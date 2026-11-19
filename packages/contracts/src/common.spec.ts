import { describe, expect, it } from 'vitest';
import { businessDateSchema, centsSchema, percentSchema } from './common.js';
import { campaignStatusLabels, campaignStatusSchema } from './campaign.js';

describe('contracts', () => {
  it('acepta solo centavos enteros', () => {
    expect(centsSchema.safeParse(5310).success).toBe(true);
    expect(centsSchema.safeParse(53.1).success).toBe(false);
  });

  it('acepta solo porcentajes enteros de 0 a 100', () => {
    for (const percent of [0, 30, 100]) expect(percentSchema.safeParse(percent).success).toBe(true);
    for (const percent of [0.7, 11.3, -1, 101, '30']) {
      expect(percentSchema.safeParse(percent).success).toBe(false);
    }
  });

  it('valida fechas de negocio', () => {
    expect(businessDateSchema.safeParse('2026-12-24').success).toBe(true);
    expect(businessDateSchema.safeParse('24/12/2026').success).toBe(false);
  });

  it('tiene etiqueta en español para cada estado', () => {
    for (const status of campaignStatusSchema.options) {
      expect(campaignStatusLabels[status]).toBeTruthy();
    }
  });
});
