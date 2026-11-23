import { describe, expect, it } from 'vitest';
import { createAttributeDefinition } from './article-type.js';
import {
  planAttributeDimension,
  planSizeDimension,
  assertDimensionSnapshot,
} from './type-dimensions.js';

const articles = [{ id: 'a', fixedAttributes: { old: 'kept' }, active: false }];
const variants = [
  {
    id: 'v1',
    articleId: 'a',
    sku: 'ONE',
    attributes: { color: 'red' },
    sizeId: null,
    active: true,
  },
  {
    id: 'v2',
    articleId: 'a',
    sku: 'TWO',
    attributes: { color: 'blue' },
    sizeId: null,
    active: false,
  },
];
const state = { articles, variants };
function definition(dataType: 'text' | 'number' | 'list' | 'boolean', definesVariant = false) {
  return createAttributeDefinition(
    {
      name: 'New',
      dataType,
      options: dataType === 'list' ? ['A', 'B'] : null,
      required: definesVariant,
      definesVariant,
    },
    [],
  );
}
describe('C6: planes puros de dimensiones', () => {
  it.each([
    ['text', 'hello'],
    ['number', 0],
    ['list', 'A'],
    ['boolean', false],
  ] as const)(
    '%s aplica el valor a fijos o variantes, incluidas inactivas, sin mutar',
    (dataType, value) => {
      const before = structuredClone(state);
      for (const scope of [false, true]) {
        const result = planAttributeDimension(definition(dataType, scope), value, state);
        expect(result.articles[0]!.fixedAttributes).toEqual(
          scope ? articles[0]!.fixedAttributes : { old: 'kept', new: value },
        );
        expect(result.variants.map((v) => v.attributes)).toEqual(
          variants.map((v) => (scope ? { ...v.attributes, new: value } : v.attributes)),
        );
        expect(result.variants.map((v) => [v.id, v.sku, v.active, v.sizeId])).toEqual(
          variants.map((v) => [v.id, v.sku, v.active, v.sizeId]),
        );
      }
      expect(state).toEqual(before);
    },
  );
  it.each([
    ['text', ''],
    ['text', false],
    ['number', '0'],
    ['number', Infinity],
    ['list', 'C'],
    ['boolean', 0],
    ['text', undefined],
  ] as const)('rechaza valor inicial inválido %s / %s', (kind, value) => {
    expect(() => planAttributeDimension(definition(kind), value, state)).toThrow();
  });
  it('unifica tamaños solo desde false y con tamaño activo, sin cambiar atributos', () => {
    const next = planSizeDimension(false, { id: 'small', active: true }, state);
    expect(next.variants.map((v) => v.sizeId)).toEqual(['small', 'small']);
    expect(next.variants.map((v) => v.attributes)).toEqual(variants.map((v) => v.attributes));
    expect(() => planSizeDimension(true, { id: 'small', active: true }, state)).toThrow();
    expect(() => planSizeDimension(false, { id: 'small', active: false }, state)).toThrow();
  });
  it('valida la unicidad final por artículo también contra inactivas', () => {
    const collision = {
      articles,
      variants: [variants[0]!, { ...variants[0]!, id: 'v3', active: false, sizeId: 'other' }],
    };
    expect(() => planSizeDimension(false, { id: 'small', active: true }, collision)).toThrow(
      /combinación/,
    );
    const repeated = {
      articles,
      variants: [variants[0]!, { ...variants[0]!, id: 'v3', active: false }],
    };
    expect(() => planAttributeDimension(definition('text'), 'yes', repeated)).toThrow(
      /combinación/,
    );
    expect(() =>
      planAttributeDimension(definition('text'), 'yes', {
        ...repeated,
        variants: repeated.variants.map((v, i) => ({ ...v, articleId: String(i) })),
      }),
    ).not.toThrow();
  });
});

describe('C6 edición con snapshot esperado', () => {
  it('compara valores y tamaño sin depender del orden de claves', () => {
    expect(() =>
      assertDimensionSnapshot({ zero: 0, no: false }, { no: false, zero: 0 }),
    ).not.toThrow();
    expect(() => assertDimensionSnapshot({ nuevo: false }, {})).toThrow(/Recarga/);
    expect(() => assertDimensionSnapshot({ nuevo: 0 }, { nuevo: false })).toThrow(/Recarga/);
    expect(() => assertDimensionSnapshot({}, {}, 'small', null)).toThrow(/Recarga/);
  });
});
