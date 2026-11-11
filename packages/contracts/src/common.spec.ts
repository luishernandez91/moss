import { describe, expect, it } from 'vitest';
import { businessDateSchema, centsSchema } from './common.js';
import { campaignStatusLabels, campaignStatusSchema } from './campaign.js';

describe('contracts', () => {
  it('acepta solo centavos enteros', () => {
    expect(centsSchema.safeParse(5310).success).toBe(true);
    expect(centsSchema.safeParse(53.1).success).toBe(false);
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
