import { describe, expect, it } from 'vitest';
import {
  createProductSchema,
  productCostQuerySchema,
  productListQuerySchema,
  productPricesSchema,
  recipeSchema,
  sizeOfferSchema,
  updateProductSchema,
} from './products.js';

/** UUID v4 determinista por llamada; el contrato solo valida la forma. */
let counter = 0;
const id = () => `0a8f8d5e-3c7b-4a35-9b6a-${(counter++).toString(16).padStart(12, '0')}`;

describe('sizeOfferSchema', () => {
  it('heredar o lista explícita no vacía y sin repetidos', () => {
    expect(sizeOfferSchema.parse({ mode: 'inherit' })).toEqual({ mode: 'inherit' });
    const small = id();
    expect(sizeOfferSchema.parse({ mode: 'explicit', sizeIds: [small] })).toEqual({
      mode: 'explicit',
      sizeIds: [small],
    });
    expect(sizeOfferSchema.safeParse({ mode: 'explicit', sizeIds: [] }).success).toBe(false);
    expect(sizeOfferSchema.safeParse({ mode: 'explicit', sizeIds: [small, small] }).success).toBe(
      false,
    );
    expect(sizeOfferSchema.safeParse({ mode: 'inherit', sizeIds: [small] }).success).toBe(false);
    expect(sizeOfferSchema.safeParse({ mode: 'explicit', sizeIds: ['chico'] }).success).toBe(false);
  });
});

describe('createProductSchema y updateProductSchema', () => {
  it('recorta el nombre y aplica valores por defecto', () => {
    expect(createProductSchema.parse({ name: '  Kokedama  ' })).toEqual({
      name: 'Kokedama',
      parentId: null,
      sizeOffer: { mode: 'inherit' },
    });
  });

  it('rechaza nombre vacío o largo, padre que no es UUID y campos de más', () => {
    for (const body of [
      { name: ' ' },
      { name: 'x'.repeat(101) },
      { name: 'Ok', parentId: 'kokedama' },
      { name: 'Ok', price: 10 },
    ]) {
      expect(createProductSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });

  it('la edición exige versión y al menos un cambio', () => {
    expect(updateProductSchema.parse({ version: 0, active: false })).toEqual({
      version: 0,
      active: false,
    });
    expect(updateProductSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(updateProductSchema.safeParse({ active: false }).success).toBe(false);
    expect(updateProductSchema.safeParse({ version: -1, name: 'x' }).success).toBe(false);
  });
});

describe('productPricesSchema', () => {
  it('precios en centavos enteros no negativos, uno por tamaño', () => {
    const small = id();
    expect(
      productPricesSchema.parse({ version: 2, prices: [{ sizeId: small, price: 12000 }] }),
    ).toEqual({ version: 2, prices: [{ sizeId: small, price: 12000 }] });
    expect(productPricesSchema.parse({ version: 2, prices: [] }).prices).toEqual([]);
    for (const prices of [
      [{ sizeId: small, price: 120.5 }],
      [{ sizeId: small, price: -1 }],
      [{ sizeId: small, price: null }],
      [
        { sizeId: small, price: 1 },
        { sizeId: small, price: 2 },
      ],
    ]) {
      expect(productPricesSchema.safeParse({ version: 0, prices }).success).toBe(false);
    }
  });
});

describe('recipeSchema', () => {
  const article = (overrides: object = {}) => ({
    kind: 'article',
    articleId: id(),
    values: [{ sizeId: null, quantity: 1 }],
    ...overrides,
  });
  const fixed = (overrides: object = {}) => ({
    kind: 'fixed',
    concept: 'Fabricación',
    category: 'labor',
    values: [{ sizeId: null, amount: 2000 }],
    ...overrides,
  });

  it('acepta componentes de artículo y de monto fijo con valores por defecto', () => {
    const parsed = recipeSchema.parse({ version: 0, components: [article(), fixed()] });
    expect(parsed.components[0]).toMatchObject({
      kind: 'article',
      variantId: null,
      attributeFilter: {},
      variantSize: null,
      concept: null,
      category: 'material',
      replacesComponentId: null,
    });
    expect(parsed.components[1]).toMatchObject({ kind: 'fixed', concept: 'Fabricación' });
  });

  it('acepta tamaño producido, tamaño fijo, filtro y cantidades fraccionarias por tamaño', () => {
    const small = id();
    const medium = id();
    const parsed = recipeSchema.parse({
      version: 0,
      components: [
        article({ variantSize: { match: 'produced' } }),
        article({ variantSize: { match: 'size', sizeId: small } }),
        article({ attributeFilter: { forma: 'redonda', diametro: 8, drenaje: true } }),
        article({
          values: [
            { sizeId: small, quantity: 0.01 },
            { sizeId: medium, quantity: 0.015 },
          ],
        }),
      ],
    });
    expect(parsed.components).toHaveLength(4);
    expect(
      recipeSchema.safeParse({
        version: 0,
        components: [article({ values: [{ sizeId: null, quantity: 12345678.1234 }] })],
      }).success,
    ).toBe(true);
  });

  it('acepta un genérico más valores por tamaño (§2)', () => {
    const small = id();
    expect(
      recipeSchema.safeParse({
        version: 0,
        components: [
          article({
            values: [
              { sizeId: null, quantity: 1 },
              { sizeId: small, quantity: 2 },
            ],
          }),
        ],
      }).success,
    ).toBe(true);
  });

  it('rechaza dos genéricos, tamaños repetidos, vacíos o con más de 4 decimales', () => {
    const small = id();
    for (const values of [
      [],
      [
        { sizeId: null, quantity: 1 },
        { sizeId: null, quantity: 2 },
      ],
      [
        { sizeId: small, quantity: 1 },
        { sizeId: small, quantity: 2 },
      ],
      [{ sizeId: null, quantity: 0 }],
      [{ sizeId: null, quantity: 0.00001 }],
      [{ sizeId: null, amount: 1 }],
    ]) {
      expect(
        recipeSchema.safeParse({ version: 0, components: [article({ values })] }).success,
        JSON.stringify(values),
      ).toBe(false);
    }
    for (const values of [[{ sizeId: null, amount: 12.5 }], [{ sizeId: null, amount: -1 }]]) {
      expect(recipeSchema.safeParse({ version: 0, components: [fixed({ values })] }).success).toBe(
        false,
      );
    }
  });

  it('rechaza formas inválidas: concepto vacío, ids repetidos, tipo desconocido y campos de más', () => {
    const repeated = id();
    for (const components of [
      [fixed({ concept: '  ' })],
      [fixed({ id: repeated }), fixed({ id: repeated, concept: 'Otro' })],
      [{ ...fixed(), kind: 'otro' }],
      [fixed({ amount: 1 })],
      [article({ variantSize: { match: 'size' } })],
      [article({ category: 'servicio' })],
    ]) {
      expect(
        recipeSchema.safeParse({ version: 0, components }).success,
        JSON.stringify(components),
      ).toBe(false);
    }
  });
});

describe('consultas', () => {
  it('lista: includeInactive como true/false', () => {
    expect(productListQuerySchema.parse({})).toEqual({ includeInactive: false });
    expect(productListQuerySchema.parse({ includeInactive: 'true' })).toEqual({
      includeInactive: true,
    });
    expect(productListQuerySchema.safeParse({ includeInactive: 'sí' }).success).toBe(false);
  });

  it('desglose: tamaño obligatorio y elecciones componente:variante', () => {
    const size = id();
    const [component, variant, other, otherVariant] = [id(), id(), id(), id()];
    expect(productCostQuerySchema.parse({ sizeId: size })).toEqual({ sizeId: size, choices: {} });
    expect(
      productCostQuerySchema.parse({ sizeId: size, choice: `${component}:${variant}` }).choices,
    ).toEqual({ [component]: variant });
    expect(
      productCostQuerySchema.parse({
        sizeId: size,
        choice: [`${component}:${variant}`, `${other}:${otherVariant}`],
      }).choices,
    ).toEqual({ [component]: variant, [other]: otherVariant });
    expect(productCostQuerySchema.safeParse({}).success).toBe(false);
    expect(productCostQuerySchema.safeParse({ sizeId: size, choice: 'a:b' }).success).toBe(false);
    expect(
      productCostQuerySchema.safeParse({
        sizeId: size,
        choice: [`${component}:${variant}`, `${component}:${other}`],
      }).success,
    ).toBe(false);
  });
});
