import { formatDate, formatDateTime, formatMoney, formatStock, formatUnitCost } from './format';

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

  it('muestra costo por unidad y existencia con la unidad del artículo; las piezas sin sufijo', () => {
    expect(formatUnitCost(50, 'm')).toBe('$0.50/m');
    expect(formatUnitCost(11000, 'bag')).toBe('$110.00/bulto');
    expect(formatUnitCost(3000, 'piece')).toBe('$30.00');
    expect(formatStock(300, 'm')).toBe('300 m');
    expect(formatStock(1.25, 'kg')).toBe('1.25 kg');
    expect(formatStock(2, 'bag')).toBe('2 bultos');
    expect(formatStock(1, 'bag')).toBe('1 bulto');
    expect(formatStock(1500, 'piece')).toBe('1,500');
    expect(formatStock(0.5, 'l')).toBe('0.5 l');
  });

  it('formatea un instante en la zona de México', () => {
    expect(formatDateTime('2026-11-04T18:30:00.000Z')).toBe('4 nov 2026');
    // 01:00 UTC del 5 nov es todavía 4 nov en America/Mexico_City.
    expect(formatDateTime('2026-11-05T01:00:00.000Z')).toBe('4 nov 2026');
  });
});
