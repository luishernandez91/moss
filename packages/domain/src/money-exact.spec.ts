import { describe, expect, it } from 'vitest';
import {
  add,
  allocate,
  cents,
  MoneyError,
  multiply,
  percentage,
  percentageBps,
  roundRatioToCents,
  type Cents,
} from './money.js';

describe('percentageBps', () => {
  it.each([
    [154000, 3000, 46200],
    [10000, 1, 1],
    [5, 1000, 1],
    [-5, 1000, -1],
    [1, 4999, 0],
    [1, 5000, 1],
    [1, 5001, 1],
    [0, 10000, 0],
    [100000000000001, 10000, 100000000000001],
    [Number.MAX_SAFE_INTEGER, 10000, Number.MAX_SAFE_INTEGER],
    [Number.MAX_SAFE_INTEGER, 0, 0],
    [Number.MAX_SAFE_INTEGER, 5000, 4503599627370496],
    [-Number.MAX_SAFE_INTEGER, 5000, -4503599627370496],
  ])('%s centavos a %s bps → %s, half-up sin perder precisión', (amount, bps, expected) => {
    expect(percentageBps(cents(amount), bps)).toBe(expected);
  });

  it.each([-1, 10001, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rechaza bps inválidos %s',
    (bps) => {
      expect(() => percentageBps(cents(100), bps)).toThrow(MoneyError);
    },
  );

  it.each([0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rechaza monto inválido %s',
    (amount) => {
      expect(() => percentageBps(amount as Cents, 5000)).toThrow(MoneyError);
    },
  );
});

describe('allocate con pesos enteros exactos', () => {
  it.each([
    {
      amount: Number.MAX_SAFE_INTEGER,
      weights: [3333, 6667],
      expected: [3002099511605173, 6005099743135818],
    },
    {
      amount: -Number.MAX_SAFE_INTEGER,
      weights: [3333, 6667],
      expected: [-3002099511605173, -6005099743135818],
    },
    {
      amount: 101,
      weights: [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
      expected: [51, 50],
    },
    { amount: 101, weights: [0, 5000, 5000], expected: [0, 51, 50] },
    { amount: -101, weights: [0, 5000, 5000], expected: [0, -51, -50] },
    { amount: 2, weights: [0, 1, 1, 1], expected: [0, 1, 1, 0] },
    { amount: 0, weights: [40000, 20000], expected: [0, 0] },
  ])(
    'reparte $amount con pesos $weights sin desviar el residuo',
    ({ amount, weights, expected }) => {
      const frozen = Object.freeze([...weights]);
      const result = allocate(cents(amount), frozen);
      expect(result).toEqual(expected);
      expect(add(...result)).toBe(amount);
    },
  );

  it('mantiene el soporte de pesos decimales', () => {
    expect(allocate(cents(101), [33.3, 66.7])).toEqual([34, 67]);
    expect(allocate(cents(-101), [0.5, 0.5])).toEqual([-51, -50]);
  });

  it.each([[], [0, 0], [-1, 2], [NaN, 1], [Infinity, 1]])(
    'rechaza pesos inválidos %j',
    (...weights) => {
      expect(() => allocate(cents(100), weights)).toThrow(MoneyError);
    },
  );
});

describe('roundRatioToCents: único redondeo a centavos', () => {
  it('redondea half-up simétrico: 0.5 se aleja de cero', () => {
    expect(roundRatioToCents(5n, 2n)).toBe(3);
    expect(roundRatioToCents(-5n, 2n)).toBe(-3);
    expect(roundRatioToCents(7n, 2n)).toBe(4);
    expect(roundRatioToCents(2n, 3n)).toBe(1);
    expect(roundRatioToCents(1n, 3n)).toBe(0);
    expect(roundRatioToCents(-1n, 3n)).toBe(0);
    expect(roundRatioToCents(10n, 5n)).toBe(2);
  });

  it('es exacto cerca del límite de los enteros seguros', () => {
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    expect(roundRatioToCents(max * 3n, 3n)).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => roundRatioToCents(max * 2n + 2n, 2n)).toThrow(MoneyError);
  });

  it('exige un denominador positivo', () => {
    expect(() => roundRatioToCents(1n, 0n)).toThrow(MoneyError);
    expect(() => roundRatioToCents(1n, -2n)).toThrow(MoneyError);
  });

  it('multiply, percentageBps y el prorrateo de D6 redondean igual con cantidades exactas', () => {
    // Cantidad en notación exponencial: 1e-7 de $1,000,000.00 = 10 centavos.
    expect(multiply(cents(100_000_000), 1e-7)).toBe(10);
    // 0.145 × 100¢ = 14.5¢ → 15¢ aunque el producto en flotante sea 14.4999…
    expect(multiply(cents(100), 0.145)).toBe(15);
    expect(multiply(cents(-100), 0.145)).toBe(-15);
    expect(percentageBps(cents(5), 5000)).toBe(3);
  });
});

describe('percentage con porcentajes decimales', () => {
  it('redondea half-up el valor exacto, sin el error binario de percent / 100', () => {
    expect(percentage(cents(500), 0.7)).toBe(4); // 3.5¢
    expect(percentage(cents(1500), 0.7)).toBe(11); // 10.5¢
    expect(percentage(cents(250), 1.4)).toBe(4); // 3.5¢
    expect(percentage(cents(154000), 30)).toBe(46200);
  });
});
