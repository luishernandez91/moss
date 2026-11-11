import { formatDate, formatMoney } from './format';

describe('format', () => {
  it('formatea centavos como pesos mexicanos', () => {
    expect(formatMoney(154000)).toBe('$1,540.00');
    expect(formatMoney(5310)).toBe('$53.10');
    expect(formatMoney(-23000)).toBe('-$230.00');
  });

  it('formatea fechas de negocio sin desfase de zona horaria', () => {
    expect(formatDate('2026-11-10')).toBe('10 nov 2026');
    expect(formatDate('2026-12-01')).toBe('1 dic 2026');
  });
});
