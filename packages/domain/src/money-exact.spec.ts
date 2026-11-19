import { describe, expect, it } from 'vitest';
import { add, allocate, cents, MoneyError, percentageBps, type Cents } from './money.js';

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
