import { describe, expect, it } from 'vitest';
import {
  assertSizeRequirement,
  assertUsesSizeChange,
  assertSizeDeletion,
  assertSizeAssignment,
  validateSize,
  validateSizeOrder,
} from './size.js';
import { findDuplicateCombination } from './article.js';

describe('tamaños', () => {
  it('exige tamaño exactamente cuando el tipo lo usa', () => {
    expect(() => assertSizeRequirement(true, null)).toThrow('Elige un tamaño.');
    expect(() => assertSizeRequirement(false, 'small')).toThrow(
      'Este tipo de artículo no usa tamaño.',
    );
    expect(() => assertSizeRequirement(true, 'small')).not.toThrow();
    expect(() => assertSizeRequirement(false, null)).not.toThrow();
  });
  it('no cambia uses_size con artículos, aunque estén inactivos; permite conservarlo', () => {
    expect(() => assertUsesSizeChange(false, true, 1)).toThrow(
      expect.objectContaining({ code: 'ARTICLE_TYPE_IN_USE' }),
    );
    expect(() => assertUsesSizeChange(true, false, 1)).toThrow();
    expect(() => assertUsesSizeChange(true, true, 1)).not.toThrow();
    expect(() => assertUsesSizeChange(false, true, 0)).not.toThrow();
  });
  it('solo borra tamaños sin referencias y conserva asignaciones inactivas existentes', () => {
    expect(() => assertSizeDeletion(1)).toThrow(expect.objectContaining({ code: 'SIZE_IN_USE' }));
    expect(() => assertSizeDeletion(0)).not.toThrow();
    expect(() => assertSizeAssignment({ id: 's', active: false }, null)).toThrow(
      expect.objectContaining({ code: 'SIZE_INACTIVE' }),
    );
    expect(() => assertSizeAssignment({ id: 's', active: false }, 's')).not.toThrow();
  });
  it('valida clave estable y única; permite renombrar y desactivar incluso en uso', () => {
    const current = { id: 's', key: 'small', label: 'Chico', active: true };
    expect(
      validateSize({ key: 'small', label: ' Pequeño ', active: false }, [current], current),
    ).toEqual({ key: 'small', label: 'Pequeño', active: false });
    expect(() => validateSize({ ...current, key: 'other' }, [current], current)).toThrow(
      expect.objectContaining({ code: 'KEY_IMMUTABLE' }),
    );
    expect(() => validateSize(current, [current])).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_SIZE_KEY' }),
    );
    expect(() => validateSize({ ...current, key: 'Tamaño' }, [])).toThrow();
  });
  it('reordena solo una permutación completa sin duplicados', () => {
    expect(() => validateSizeOrder(['b', 'a'], ['a', 'b'])).not.toThrow();
    for (const ids of [['a'], ['a', 'a'], ['a', 'c']])
      expect(() => validateSizeOrder(ids, ['a', 'b'])).toThrow();
  });
  it('incluye tamaño en combinaciones, también inactivas y al editar', () => {
    const variants = [{ id: 'v', sku: 'S', sizeId: 'small', attributes: {}, active: false }];
    expect(findDuplicateCombination({}, variants, undefined, 'small')).toEqual(variants[0]);
    expect(findDuplicateCombination({}, variants, undefined, 'medium')).toBeUndefined();
    expect(findDuplicateCombination({}, variants, 'v', 'small')).toBeUndefined();
    expect(findDuplicateCombination({}, [{ ...variants[0]!, sizeId: null }])).toBeDefined();
    expect(findDuplicateCombination({}, variants)).toBeUndefined();
  });
});
