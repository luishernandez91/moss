import { describe, expect, it } from 'vitest';
import {
  add,
  allocate,
  cents,
  fromPesos,
  marginPercent,
  MoneyError,
  multiply,
  percentage,
  subtract,
} from './money.js';

describe('money', () => {
  it('rechaza montos que no son centavos enteros', () => {
    expect(() => cents(10.5)).toThrow(MoneyError);
  });

  it('convierte pesos escritos a centavos sin flotantes', () => {
    expect(fromPesos('110')).toBe(11000);
    expect(fromPesos('0.5')).toBe(50);
    expect(fromPesos('1540.10')).toBe(154010);
    expect(fromPesos('-230')).toBe(-23000);
    expect(() => fromPesos('1.234')).toThrow(MoneyError);
  });

  // Casos de la especificación, sección 2.
  it('0.01 de bulto a $110.00 = $1.10', () => {
    expect(multiply(fromPesos('110'), 0.01)).toBe(110);
  });

  it('4 m de hilo a $0.50 = $2.00', () => {
    expect(multiply(fromPesos('0.50'), 4)).toBe(200);
  });

  it('redondea half-up una sola vez', () => {
    expect(multiply(cents(1), 0.5)).toBe(1);
    expect(multiply(cents(3), 0.5)).toBe(2);
    expect(multiply(cents(-3), 0.5)).toBe(-2);
  });

  it('Kokedama Nochebuena chica cuesta $53.10', () => {
    const total = add(
      fromPesos('30'),
      fromPesos('20'),
      multiply(fromPesos('0.50'), 4),
      multiply(fromPesos('110'), 0.01),
      fromPesos('0'),
    );
    expect(total).toBe(5310);
  });

  it('reinversión de 30% sobre $1,540 = $462', () => {
    expect(percentage(fromPesos('1540'), 30)).toBe(46200);
  });

  it('reparte 50/50 sin perder centavos', () => {
    expect(allocate(fromPesos('1540'), [50, 50])).toEqual([77000, 77000]);
    expect(allocate(cents(101), [50, 50])).toEqual([51, 50]);
    expect(allocate(fromPesos('-460'), [50, 50])).toEqual([-23000, -23000]);
  });

  it('el reparto con pesos en cero no recibe residuo', () => {
    expect(allocate(cents(5), [0, 1])).toEqual([0, 5]);
  });

  it('calcula margen sobre precio', () => {
    expect(marginPercent(fromPesos('53.10'), fromPesos('120'))).toBeCloseTo(55.75, 2);
    expect(marginPercent(cents(100), cents(0))).toBeNull();
  });

  it('suma y resta', () => {
    expect(subtract(fromPesos('3600'), fromPesos('2060'))).toBe(154000);
  });
});
