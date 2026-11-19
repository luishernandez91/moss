import { describe, expect, it } from 'vitest';
import {
  ArticleError,
  assertArticleFlags,
  combinationKey,
  findDuplicateCombination,
  normalizeSku,
  STOCK_UNITS,
  stockUnitLabels,
  validateStock,
  type ArticleErrorCode,
} from './article.js';

function expectError(action: () => unknown, code: ArticleErrorCode, message?: string) {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ArticleError);
  expect((caught as ArticleError).code).toBe(code);
  if (message !== undefined) expect((caught as ArticleError).message).toBe(message);
}

describe('unidades de existencia', () => {
  it('valores en inglés con etiquetas en español', () => {
    expect(STOCK_UNITS).toEqual(['piece', 'm', 'kg', 'l', 'bag']);
    expect(stockUnitLabels).toEqual({ piece: 'pieza', m: 'm', kg: 'kg', l: 'l', bag: 'bulto' });
  });
});

describe('normalizeSku', () => {
  it('recorta y pasa a mayúsculas', () => {
    expect(normalizeSku('  mac-con-r08-gr ')).toBe('MAC-CON-R08-GR');
  });

  it('rechaza formatos inválidos', () => {
    for (const sku of ['', ' ', '-ABC', 'MAC CON', 'MAC_CON', 'Ñ1', 'A'.repeat(41)]) {
      expectError(() => normalizeSku(sku), 'INVALID_SKU');
    }
  });
});

describe('assertArticleFlags', () => {
  it('exige «se vende» o «se usa en recetas»', () => {
    expect(() => assertArticleFlags({ sold: true, usedInRecipes: false })).not.toThrow();
    expect(() => assertArticleFlags({ sold: false, usedInRecipes: true })).not.toThrow();
    expectError(
      () => assertArticleFlags({ sold: false, usedInRecipes: false }),
      'INVALID_FLAGS',
      'Un artículo se vende, se usa en recetas o ambas.',
    );
  });
});

describe('validateStock', () => {
  it('acepta existencias no negativas con hasta 3 decimales', () => {
    expect(validateStock(0)).toBe(0);
    expect(validateStock(300)).toBe(300);
    expect(validateStock(0.125)).toBe(0.125);
  });

  it('rechaza negativos, más de 3 decimales o valores fuera de numeric(12,3)', () => {
    for (const stock of [-1, 0.0005, Number.NaN, Number.POSITIVE_INFINITY, 1e9]) {
      expectError(() => validateStock(stock), 'INVALID_STOCK');
    }
  });
});

describe('combinaciones de variante', () => {
  it('la clave no depende del orden de los atributos', () => {
    expect(combinationKey({ forma: 'redonda', diametro: 8 })).toBe(
      combinationKey({ diametro: 8, forma: 'redonda' }),
    );
    expect(combinationKey({ diametro: 8 })).not.toBe(combinationKey({ diametro: '8' }));
    expect(combinationKey({})).toBe('{}');
  });

  it('encuentra la primera combinación repetida, incluidas las variantes inactivas', () => {
    const existing = [
      { id: 'v1', sku: 'MAC-1', attributes: { forma: 'redonda', diametro: 8 }, active: false },
      { id: 'v2', sku: 'MAC-2', attributes: { forma: 'cuadrada', diametro: 10 }, active: true },
    ];
    expect(findDuplicateCombination({ diametro: 8, forma: 'redonda' }, existing)).toEqual(
      existing[0],
    );
    expect(findDuplicateCombination({ forma: 'redonda', diametro: 10 }, existing)).toBeUndefined();
    expect(findDuplicateCombination({ forma: 'redonda', diametro: 8 }, existing, 'v1')).toBe(
      undefined,
    );
  });

  it('un artículo sin atributos de variante admite una sola variante con atributos vacíos', () => {
    const single = [{ id: 'v1', sku: 'SUS-FIB', attributes: {}, active: true }];
    expect(findDuplicateCombination({}, single)).toEqual(single[0]);
  });
});
