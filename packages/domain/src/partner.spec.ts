import { describe, expect, it } from 'vitest';
import {
  assertCanCreatePartner,
  validatePartnerSettings,
  percentageToShareBps,
} from './partner.js';

const pair = [
  { id: 'a', name: ' Ana ', shareBps: 5000 },
  { id: 'b', name: 'Bruno', shareBps: 5000 },
];

describe('configuración de socios', () => {
  it('conserva 50/50 y recorta nombres sin mutar la entrada', () => {
    expect(validatePartnerSettings(pair)[0]).toEqual({ ...pair[0], name: 'Ana' });
    expect(pair[0]!.name).toBe(' Ana ');
  });
  it.each([
    [0, 10000],
    [10000, 0],
    [3700, 6300],
  ])('acepta %i/%i', (a, b) => {
    expect(
      validatePartnerSettings([
        { ...pair[0]!, shareBps: a },
        { ...pair[1]!, shareBps: b },
      ]),
    ).toHaveLength(2);
  });
  it.each([[], [pair[0]!], [...pair, pair[0]!], [pair[0]!, pair[0]!]].map((input) => ({ input })))(
    'exige exactamente dos socios distintos',
    ({ input }) => {
      expect(() => validatePartnerSettings(input)).toThrow(
        'Se requieren exactamente dos socios con identificadores distintos.',
      );
    },
  );
  it.each([-100, 10001, 5050, 50.5, NaN, Infinity])(
    'rechaza participación inválida %s',
    (shareBps) => {
      expect(() => validatePartnerSettings([{ ...pair[0]!, shareBps }, pair[1]!])).toThrow(
        'Usa porcentajes enteros entre 0 y 100.',
      );
    },
  );
  it.each([4900, 5100])('exige suma exacta', (shareBps) => {
    expect(() => validatePartnerSettings([{ ...pair[0]!, shareBps }, pair[1]!])).toThrow(
      'Las participaciones deben sumar 100%.',
    );
  });
  it.each([' ', 'x'.repeat(101)])('rechaza nombre inválido', (name) => {
    expect(() => validatePartnerSettings([{ ...pair[0]!, name }, pair[1]!])).toThrow(
      'El nombre debe tener entre 1 y 100 caracteres.',
    );
  });
  it('convierte solo porcentajes enteros a puntos base', () => {
    expect(percentageToShareBps(37)).toBe(3700);
    expect(() => percentageToShareBps(37.5)).toThrow();
  });
  it('permite las primeras dos altas y rechaza la tercera', () => {
    expect(() => assertCanCreatePartner(0)).not.toThrow();
    expect(() => assertCanCreatePartner(1)).not.toThrow();
    expect(() => assertCanCreatePartner(2)).toThrow('Solo puede haber dos socios.');
  });
});
