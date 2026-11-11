import { describe, expect, it } from 'vitest';
import { businessDate, compareDates, isWithin, today, toBusinessDate } from './business-date.js';

const fixedClock = (iso: string) => ({ now: () => new Date(iso) });

describe('business-date', () => {
  it('"hoy" se calcula en la Ciudad de México, no en UTC', () => {
    // 11 nov 2026 a las 05:30 UTC sigue siendo 10 nov en CDMX (UTC-6).
    expect(today(fixedClock('2026-11-11T05:30:00Z'))).toBe('2026-11-10');
    expect(today(fixedClock('2026-11-11T06:30:00Z'))).toBe('2026-11-11');
  });

  it('convierte instantes a día calendario en otra zona', () => {
    expect(toBusinessDate(new Date('2026-11-11T05:30:00Z'), 'UTC')).toBe('2026-11-11');
  });

  it('valida el formato y fechas inexistentes', () => {
    expect(() => businessDate('2026-02-30')).toThrow(RangeError);
    expect(() => businessDate('11/10/2026')).toThrow(RangeError);
    expect(businessDate('2026-12-24')).toBe('2026-12-24');
  });

  it('compara fechas y rangos cerrados', () => {
    const start = businessDate('2026-12-10');
    const end = businessDate('2026-12-31');
    expect(compareDates(start, end)).toBeLessThan(0);
    expect(isWithin(businessDate('2026-12-10'), start, end)).toBe(true);
    expect(isWithin(businessDate('2026-12-31'), start, end)).toBe(true);
    expect(isWithin(businessDate('2027-01-01'), start, end)).toBe(false);
  });
});
