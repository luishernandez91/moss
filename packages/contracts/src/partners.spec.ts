import { describe, expect, it } from 'vitest';
import { partnerShareBpsSchema, updatePartnersSchema } from './partners.js';
const partner = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Ana',
  shareBps: 5000,
  version: 0,
};
describe('contratos de socios', () => {
  it.each([0, 5000, 6300, 10000])('acepta puntos base %i', (value) =>
    expect(partnerShareBpsSchema.safeParse(value).success).toBe(true),
  );
  it.each([-100, 10001, 5050, 50.5, '5000'])('rechaza %s', (value) =>
    expect(partnerShareBpsSchema.safeParse(value).success).toBe(false),
  );
  it('exige ambos socios, versión y solo campos conocidos', () => {
    const second = { ...partner, id: '00000000-0000-4000-8000-000000000002' };
    expect(updatePartnersSchema.safeParse({ partners: [partner, second] }).success).toBe(true);
    for (const input of [
      { partners: [partner] },
      { partners: [{ ...partner, version: -1 }, second] },
      { partners: [{ ...partner, version: undefined }, second] },
      { partners: [{ ...partner, userId: partner.id }, second] },
    ])
      expect(updatePartnersSchema.safeParse(input).success).toBe(false);
  });
});
