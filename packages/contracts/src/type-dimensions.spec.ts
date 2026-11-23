import { updateArticleSchema, updateVariantSchema } from './articles.js';
import { describe, expect, it } from 'vitest';
import { createAttributeDimensionSchema, enableTypeSizeSchema } from './type-dimensions.js';
const attribute = { name: 'Nuevo', required: false, definesVariant: false };
describe('C6 contratos explícitos, sin valor predeterminado', () => {
  it.each([
    ['text', 'ok'],
    ['number', 0],
    ['list', 'A'],
    ['boolean', false],
  ] as const)('acepta %s', (dataType, initialValue) => {
    const input = {
      attribute: { ...attribute, dataType, ...(dataType === 'list' ? { options: ['A'] } : {}) },
      initialValue,
    };
    expect(createAttributeDimensionSchema.parse(input)).toEqual(input);
  });
  it.each([undefined, null, {}, []])('exige valor inicial escalar (%s)', (initialValue) => {
    expect(
      createAttributeDimensionSchema.safeParse({
        attribute: { ...attribute, dataType: 'text' },
        initialValue,
      }).success,
    ).toBe(false);
  });
  it('no admite cambiar definición existente ni persistir default', () => {
    expect(
      createAttributeDimensionSchema.safeParse({
        attribute: { ...attribute, dataType: 'text', id: 'old' },
        initialValue: 'ok',
      }).success,
    ).toBe(false);
    expect(
      createAttributeDimensionSchema.safeParse({
        attribute: { ...attribute, dataType: 'text' },
        initialValue: 'ok',
        defaultValue: 'ok',
      }).success,
    ).toBe(false);
  });
  it('solo habilita con un UUID de tamaño obligatorio', () => {
    expect(
      enableTypeSizeSchema.parse({ initialSizeId: 'dd715425-bae6-47d3-a308-b9212daf555a' }),
    ).toEqual({ initialSizeId: 'dd715425-bae6-47d3-a308-b9212daf555a' });
    for (const input of [
      {},
      { initialSizeId: null },
      { initialSizeId: 'small' },
      { initialSizeId: 'dd715425-bae6-47d3-a308-b9212daf555a', usesSize: false },
    ])
      expect(enableTypeSizeSchema.safeParse(input).success).toBe(false);
  });
});

it('ediciones admiten snapshot esperado sin confundir 0, false y ausencia', () => {
  expect(
    updateArticleSchema.parse({
      fixedAttributes: {},
      expectedFixedAttributes: { zero: 0, no: false },
    }),
  ).toEqual({ fixedAttributes: {}, expectedFixedAttributes: { zero: 0, no: false } });
  expect(
    updateVariantSchema.parse({
      attributes: {},
      expectedDimension: { attributes: { no: false }, sizeId: null },
    }),
  ).toEqual({ attributes: {}, expectedDimension: { attributes: { no: false }, sizeId: null } });
});
