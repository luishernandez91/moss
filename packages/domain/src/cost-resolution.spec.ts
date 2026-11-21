import { describe, expect, it, vi } from 'vitest';
import {
  CostResolutionError,
  previewCost,
  resolveCost,
  SIZE_PLACEHOLDER,
  type Article,
  type CostBreakdown,
  type CostResolutionErrorCode,
  type FixedComponent,
  type Product,
  type ResolveCostInput,
} from './cost-resolution.js';
import { cents, MoneyError, type Cents } from './money.js';
import {
  sampleAddOn,
  sampleArticles,
  sampleProducts,
  pesos,
} from './test-fixtures/sample-catalog.js';

function resolve(
  overrides: Partial<ResolveCostInput> & Pick<ResolveCostInput, 'productId' | 'size'>,
) {
  return resolveCost({ products: sampleProducts, articles: sampleArticles, ...overrides });
}

function expectError(fn: () => unknown, code: CostResolutionErrorCode, message?: RegExp) {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(CostResolutionError);
  expect((caught as CostResolutionError).code).toBe(code);
  if (message) {
    expect((caught as CostResolutionError).message).toMatch(message);
  }
}

function line(breakdown: CostBreakdown, componentId: string) {
  const found = breakdown.lines.find((candidate) => candidate.componentId === componentId);
  if (!found) {
    throw new Error(`No hay línea ${componentId}`);
  }
  return found;
}

function activeSum(breakdown: CostBreakdown): number {
  return breakdown.lines
    .filter((candidate) => candidate.origin !== 'overridden')
    .reduce((sum, candidate) => sum + (candidate.subtotal ?? 0), 0);
}

const labor = (
  id: string,
  amount: number,
  extra: Pick<FixedComponent, 'size' | 'replacesComponentId'> = {},
): FixedComponent => ({
  id,
  kind: 'fixed',
  category: 'labor',
  concept: 'Fabricación',
  amount: pesos(amount),
  ...extra,
});

describe('resolveCost · catálogo de ejemplo', () => {
  it('Kokedama Nochebuena chica = $53.10 con planta propia y receta heredada', () => {
    const result = resolve({ productId: 'kokedama-nochebuena', size: 'chico' });

    expect(result.total).toBe(5310);
    expect(result.addOnId).toBeNull();
    expect(line(result, 'kn-planta')).toMatchObject({
      origin: 'own',
      concept: 'Nochebuena',
      variantSku: 'PLA-NOC-CH',
      quantity: 1,
      unitCost: 3000,
      subtotal: 3000,
      source: { kind: 'product', productId: 'kokedama-nochebuena' },
    });
    expect(line(result, 'k-fab')).toMatchObject({
      origin: 'inherited',
      kind: 'fixed',
      category: 'labor',
      quantity: 1,
      unitCost: 2000,
      subtotal: 2000,
    });
    expect(line(result, 'k-hilo')).toMatchObject({
      origin: 'inherited',
      quantity: 4,
      unitCost: 50,
      subtotal: 200,
    });
    expect(line(result, 'k-tierra')).toMatchObject({
      origin: 'inherited',
      variantSku: 'SUS-TIE-20L',
      quantity: 0.01,
      unitCost: 11000,
      subtotal: 110,
    });
    expect(line(result, 'k-fibra')).toMatchObject({ origin: 'inherited', subtotal: 0 });
    expect(result.lines.map((candidate) => candidate.componentId)).toEqual([
      'kn-planta',
      'k-fibra',
      'k-tierra',
      'k-hilo',
      'k-fab',
    ]);
  });

  it('Kokedama Nochebuena chica + Reno = $71.60 (Reno $18.50)', () => {
    const result = resolve({
      productId: 'kokedama-nochebuena',
      size: 'chico',
      addOn: sampleAddOn('reno'),
    });

    expect(result.total).toBe(7160);
    expect(result.addOnId).toBe('reno');
    const addOnLines = result.lines.filter((candidate) => candidate.source.kind === 'addOn');
    expect(addOnLines.map((candidate) => candidate.subtotal)).toEqual([100, 100, 400, 1250]);
    expect(addOnLines.every((candidate) => candidate.origin === 'own')).toBe(true);
    expect(result.lines.slice(-4)).toEqual(addOnLines);
  });

  it('Kokedama Helecho Boston chica = $62.85: sustituye la fabricación y agrega humus', () => {
    const result = resolve({ productId: 'kokedama-helecho', size: 'chico' });

    expect(result.total).toBe(6285);
    expect(line(result, 'k-fab')).toMatchObject({
      origin: 'overridden',
      replacedBy: 'kh-fab',
      subtotal: 2000,
    });
    expect(line(result, 'kh-fab')).toMatchObject({
      origin: 'own',
      subtotal: 2400,
      replacedBy: null,
    });
    expect(line(result, 'kh-humus')).toMatchObject({
      origin: 'own',
      quantity: 0.03,
      unitCost: 2500,
      subtotal: 75,
    });
    expect(line(result, 'kh-planta').subtotal).toBe(3500);
    expect(activeSum(result)).toBe(result.total);
  });

  it('Kokedama Nochebuena mediana + Reno = $93.15 con el catálogo (incluye tierra)', () => {
    const result = resolve({
      productId: 'kokedama-nochebuena',
      size: 'mediano',
      addOn: sampleAddOn('reno'),
    });

    expect(line(result, 'kn-planta').subtotal).toBe(4500);
    expect(line(result, 'k-hilo').subtotal).toBe(300);
    expect(line(result, 'k-tierra').subtotal).toBe(165);
    expect(line(result, 'k-fab').subtotal).toBe(2500);
    expect(result.total).toBe(9315);
  });

  it('caso §10: Nochebuena mediana + Reno = $91.50 con una receta sin tierra', () => {
    const withoutSoil = sampleProducts.map((product) =>
      product.id === 'kokedama'
        ? {
            ...product,
            components: product.components.filter((component) => component.id !== 'k-tierra'),
          }
        : product,
    );
    const result = resolve({
      products: withoutSoil,
      productId: 'kokedama-nochebuena',
      size: 'mediano',
      addOn: sampleAddOn('reno'),
    });

    expect(result.total).toBe(9150);
  });

  it('Cactus en maceta de concreto chica exige elegir el color de la maceta', () => {
    expectError(
      () => resolve({ productId: 'cactus-maceta-concreto', size: 'chico' }),
      'AMBIGUOUS_VARIANT',
      /MAC-CON-R08-GR.*MAC-CON-R08-BL/,
    );
  });

  it('Cactus en maceta de concreto chica con MAC-CON-R08-GR = $45.50', () => {
    const result = resolve({
      productId: 'cactus-maceta-concreto',
      size: 'chico',
      variantChoices: { 'cm-maceta': 'MAC-CON-R08-GR' },
    });

    expect(line(result, 'cm-maceta')).toMatchObject({
      variantSku: 'MAC-CON-R08-GR',
      subtotal: 1500,
    });
    expect(line(result, 'pm-arm')).toMatchObject({ origin: 'inherited', subtotal: 800 });
    expect(line(result, 'cm-sustrato').subtotal).toBe(450);
    expect(result.total).toBe(4550);
  });

  it('rechaza una variante elegida que no cumple el filtro', () => {
    expectError(
      () =>
        resolve({
          productId: 'cactus-maceta-concreto',
          size: 'chico',
          variantChoices: { 'cm-maceta': 'MAC-CON-R10-GR' },
        }),
      'VARIANT_NOT_ALLOWED',
    );
  });

  it('rechaza una variante elegida para un componente que no está en la receta', () => {
    expectError(
      () =>
        resolve({
          productId: 'cactus-maceta-concreto',
          size: 'chico',
          variantChoices: { 'cm-maceta': 'MAC-CON-R08-GR', 'no-existe': 'MAC-CON-R08-BL' },
        }),
      'UNKNOWN_VARIANT_CHOICE',
    );
  });

  it('rechaza un tamaño que el producto no ofrece', () => {
    expectError(
      () => resolve({ productId: 'cactus-maceta-concreto', size: 'mediano' }),
      'SIZE_NOT_OFFERED',
    );
  });

  it('Helecho grande: el catálogo ofrece solo chico y mediano', () => {
    expectError(
      () => resolve({ productId: 'kokedama-helecho', size: 'grande' }),
      'SIZE_NOT_OFFERED',
      /chico, mediano/,
    );
  });

  it('Helecho grande sin oferta propia: la fabricación heredada cubre el tamaño, pero no hay helecho grande', () => {
    const inheritsSizes = sampleProducts.map((product) => {
      if (product.id !== 'kokedama-helecho') return product;
      const { sizes: _offer, ...withoutOffer } = product;
      return withoutOffer;
    });
    expectError(
      () => resolve({ products: inheritsSizes, productId: 'kokedama-helecho', size: 'grande' }),
      'NO_MATCHING_VARIANT',
      /Helecho Boston/,
    );
  });

  it('rechaza un extra que no aplica al producto', () => {
    expectError(
      () =>
        resolve({
          productId: 'cactus-maceta-concreto',
          size: 'chico',
          addOn: sampleAddOn('reno'),
          variantChoices: { 'cm-maceta': 'MAC-CON-R08-GR' },
        }),
      'ADDON_NOT_APPLICABLE',
    );
  });

  it('usa la función de costo inyectada para artículos y no para montos fijos', () => {
    const costOf = vi.fn((variant: Article['variants'][number]) =>
      variant.sku === 'PLA-NOC-CH' ? cents(3500) : variant.averageCost,
    );
    const result = resolve({ productId: 'kokedama-nochebuena', size: 'chico', costOf });

    expect(result.total).toBe(5810);
    expect(costOf).toHaveBeenCalledTimes(4);
    expect(costOf.mock.calls.map(([variant]) => variant.sku)).not.toContain(undefined);
  });
});

describe('resolveCost · árbol', () => {
  const article: Article = {
    id: 'insumo',
    name: 'Insumo',
    stockUnit: 'piece',
    variants: [
      { id: 'INS-1', sku: 'INS-1', sizeId: null, attributes: {}, averageCost: cents(1000) },
    ],
  };
  const articles = [article];
  const node = (
    id: string,
    parentId: string | null,
    components: Product['components'] = [],
  ): Product => ({
    id,
    parentId,
    name: `Producto ${id}`,
    components,
  });

  it('acepta un árbol de 3 niveles con origen heredado desde el abuelo', () => {
    const products = [
      node('a', null, [labor('a-fab', 10)]),
      node('b', 'a'),
      node('c', 'b', [
        { id: 'c-ins', kind: 'article', category: 'material', articleId: 'insumo', quantity: 1 },
      ]),
    ];
    const result = resolveCost({ products, articles, productId: 'c', size: 'chico' });

    expect(result.total).toBe(2000);
    expect(line(result, 'a-fab')).toMatchObject({
      origin: 'inherited',
      source: { kind: 'product', productId: 'a' },
    });
  });

  it('rechaza árboles de más de 3 niveles', () => {
    const products = [
      node('a', null, [labor('a-fab', 10)]),
      node('b', 'a'),
      node('c', 'b'),
      node('d', 'c'),
    ];
    expectError(
      () => resolveCost({ products, articles, productId: 'd', size: 'chico' }),
      'TREE_TOO_DEEP',
      /3 niveles/,
    );
  });

  it('rechaza ciclos en el árbol', () => {
    const products = [node('a', 'b', [labor('a-fab', 10)]), node('b', 'a')];
    expectError(
      () => resolveCost({ products, articles, productId: 'a', size: 'chico' }),
      'CYCLE',
      /ciclo/,
    );
  });

  it('rechaza un padre inexistente y un producto inexistente', () => {
    expectError(
      () => resolveCost({ products: [node('a', 'zz')], articles, productId: 'a', size: 'chico' }),
      'PARENT_NOT_FOUND',
    );
    expectError(
      () => resolveCost({ products: [], articles, productId: 'a', size: 'chico' }),
      'PRODUCT_NOT_FOUND',
    );
  });

  it('un componente con tamaño sustituye al genérico del mismo concepto', () => {
    const products = [node('a', null, [labor('fab', 20), labor('fab-gr', 30, { size: 'grande' })])];

    const big = resolveCost({ products, articles, productId: 'a', size: 'grande' });
    expect(big.total).toBe(3000);
    expect(line(big, 'fab')).toMatchObject({
      origin: 'overridden',
      replacedBy: 'fab-gr',
      subtotal: 2000,
    });
    expect(line(big, 'fab-gr')).toMatchObject({ origin: 'own', subtotal: 3000 });

    const small = resolveCost({ products, articles, productId: 'a', size: 'chico' });
    expect(small.total).toBe(2000);
    expect(small.lines.map((candidate) => candidate.componentId)).toEqual(['fab']);
  });

  it('rechaza dos componentes genéricos con la misma clave en un producto', () => {
    const products = [node('a', null, [labor('fab-1', 20), labor('fab-2', 25)])];
    expectError(
      () => resolveCost({ products, articles, productId: 'a', size: 'chico' }),
      'DUPLICATE_COMPONENT',
    );
  });

  it('error si una cantidad por tamaño no incluye el tamaño pedido y nada la cubre', () => {
    const products = [
      node('a', null, [
        {
          id: 'hilo',
          kind: 'article',
          category: 'material',
          articleId: 'insumo',
          quantity: { chico: 4, mediano: 6 },
        },
      ]),
    ];
    expectError(
      () => resolveCost({ products, articles, productId: 'a', size: 'grande' }),
      'NO_COMPONENT_FOR_SIZE',
      /grande/,
    );
  });

  it('una sustitución que no cubre el tamaño deja vigente el componente heredado', () => {
    const products = [
      node('a', null, [labor('fab', 20)]),
      node('b', 'a', [
        {
          id: 'fab-b',
          kind: 'fixed',
          category: 'labor',
          concept: 'Fabricación especial',
          amount: { chico: pesos(24) },
          replacesComponentId: 'fab',
        },
      ]),
    ];

    const medium = resolveCost({ products, articles, productId: 'b', size: 'mediano' });
    expect(medium.lines).toHaveLength(1);
    expect(line(medium, 'fab')).toMatchObject({ origin: 'inherited', replacedBy: null });
    expect(medium.total).toBe(2000);

    const small = resolveCost({ products, articles, productId: 'b', size: 'chico' });
    expect(small.total).toBe(2400);
  });

  it('rechaza sustituir un componente que no es heredado', () => {
    const products = [
      node('a', null, [labor('fab', 20)]),
      node('b', 'a', [labor('fab-b', 24, { replacesComponentId: 'no-existe' })]),
    ];
    expectError(
      () => resolveCost({ products, articles, productId: 'b', size: 'chico' }),
      'INVALID_REPLACEMENT',
    );
  });

  it('una línea sustituida que no se puede resolver queda sin costo y no lanza error', () => {
    const ambiguous: Article = {
      id: 'maceta',
      name: 'Maceta',
      stockUnit: 'piece',
      variants: [
        {
          id: 'M-GR',
          sku: 'M-GR',
          sizeId: null,
          attributes: { color: 'gris' },
          averageCost: cents(1500),
        },
        {
          id: 'M-BL',
          sku: 'M-BL',
          sizeId: null,
          attributes: { color: 'blanco' },
          averageCost: cents(1500),
        },
      ],
    };
    const products = [
      node('a', null, [
        { id: 'mac', kind: 'article', category: 'material', articleId: 'maceta', quantity: 1 },
      ]),
      node('b', 'a', [
        {
          id: 'mac-b',
          kind: 'article',
          category: 'material',
          articleId: 'maceta',
          variantId: 'M-GR',
          quantity: 1,
          replacesComponentId: 'mac',
        },
      ]),
    ];
    const result = resolveCost({ products, articles: [ambiguous], productId: 'b', size: 'chico' });

    expect(line(result, 'mac')).toMatchObject({
      origin: 'overridden',
      unitCost: null,
      subtotal: null,
    });
    expect(result.total).toBe(1500);
  });

  it('rechaza un artículo inexistente', () => {
    const products = [
      node('a', null, [
        { id: 'x', kind: 'article', category: 'material', articleId: 'nada', quantity: 1 },
      ]),
    ];
    expectError(
      () => resolveCost({ products, articles, productId: 'a', size: 'chico' }),
      'ARTICLE_NOT_FOUND',
    );
  });

  it('redondea cada línea una sola vez y el total es la suma de las líneas', () => {
    const products = [
      node('a', null, [
        { id: 'x', kind: 'article', category: 'material', articleId: 'insumo', quantity: 0.333 },
        {
          id: 'y',
          kind: 'article',
          category: 'material',
          articleId: 'insumo',
          quantity: 0.3335,
          concept: 'Otro',
          variantId: 'INS-1',
        },
      ]),
    ];
    const result = resolveCost({ products, articles, productId: 'a', size: 'chico' });

    expect(line(result, 'x').subtotal).toBe(333);
    expect(line(result, 'y').subtotal).toBe(334);
    expect(result.total).toBe(667);
  });

  it('reporta un ciclo largo como ciclo y no como profundidad', () => {
    const products = [
      node('a', 'd', [labor('a-fab', 10)]),
      node('b', 'a'),
      node('c', 'b'),
      node('d', 'c'),
    ];
    expectError(() => resolveCost({ products, articles, productId: 'a', size: 'chico' }), 'CYCLE');
  });

  it('rechaza versiones por tamaño de un componente que no sustituyen al mismo heredado', () => {
    const products = [
      node('a', null, [labor('fab', 20)]),
      node('b', 'a', [
        { ...labor('fab-b', 24, { replacesComponentId: 'fab' }), concept: 'Fabricación especial' },
        { ...labor('fab-b-gr', 35, { size: 'grande' }), concept: 'Fabricación especial' },
      ]),
    ];
    expectError(
      () => resolveCost({ products, articles, productId: 'b', size: 'grande' }),
      'INVALID_REPLACEMENT',
    );
    expectError(
      () => resolveCost({ products, articles, productId: 'b', size: 'chico' }),
      'INVALID_REPLACEMENT',
    );
  });

  it('una sustitución cubre un tamaño que el heredado no define', () => {
    const products = [
      node('a', null, [{ ...labor('fab', 0), amount: { chico: pesos(20) } }]),
      node('b', 'a', [
        {
          ...labor('fab-b', 0, { replacesComponentId: 'fab' }),
          concept: 'Fabricación grande',
          amount: { grande: pesos(30) },
        },
      ]),
    ];
    expect(resolveCost({ products, articles, productId: 'b', size: 'grande' }).total).toBe(3000);
    expectError(
      () => resolveCost({ products, articles, productId: 'a', size: 'grande' }),
      'NO_COMPONENT_FOR_SIZE',
    );
  });

  it('rechaza montos y costos que no son centavos enteros', () => {
    const fixed = [node('a', null, [{ ...labor('fab', 0), amount: 12.5 as Cents }])];
    expect(() => resolveCost({ products: fixed, articles, productId: 'a', size: 'chico' })).toThrow(
      MoneyError,
    );

    const withArticle = [
      node('a', null, [
        { id: 'x', kind: 'article', category: 'material', articleId: 'insumo', quantity: 1 },
      ]),
    ];
    expect(() =>
      resolveCost({
        products: withArticle,
        articles,
        productId: 'a',
        size: 'chico',
        costOf: () => 33.333 as Cents,
      }),
    ).toThrow(MoneyError);
  });
});

describe('resolveCost · tamaño como dimensión (C3/C4)', () => {
  const plant: Article = {
    id: 'planta',
    name: 'Planta',
    stockUnit: 'piece',
    variants: [
      { id: 'v-ch', sku: 'P-CH', sizeId: 'small', attributes: {}, averageCost: cents(3000) },
      { id: 'v-md', sku: 'P-MD', sizeId: 'medium', attributes: {}, averageCost: cents(4500) },
      // Un atributo con el nombre anterior no cuenta como tamaño.
      {
        id: 'v-old',
        sku: 'P-OLD',
        sizeId: null,
        attributes: { tamano: 'small' },
        averageCost: cents(1),
      },
    ],
  };
  const pot: Article = {
    id: 'maceta',
    name: 'Maceta',
    stockUnit: 'piece',
    variants: [
      {
        id: 'm-gr',
        sku: 'M-GR',
        sizeId: null,
        attributes: { forma: 'redonda', color: 'gris' },
        averageCost: cents(1500),
      },
      {
        id: 'm-bl',
        sku: 'M-BL',
        sizeId: null,
        attributes: { forma: 'redonda', color: 'blanco' },
        averageCost: cents(1600),
        active: false,
      },
      {
        id: 'm-ne',
        sku: 'M-NE',
        sizeId: null,
        attributes: { forma: 'cuadrada', color: 'negro' },
        averageCost: cents(2000),
        active: false,
      },
    ],
  };
  const articles = [plant, pot];
  const product = (components: Product['components']): Product[] => [
    { id: 'p', parentId: null, name: 'Producto', components },
  ];

  it('{size} empareja la variante por sizeId con el tamaño producido', () => {
    const products = product([
      {
        id: 'pl',
        kind: 'article',
        category: 'material',
        articleId: 'planta',
        variantSize: SIZE_PLACEHOLDER,
        quantity: 1,
      },
    ]);
    expect(resolveCost({ products, articles, productId: 'p', size: 'small' })).toMatchObject({
      total: 3000,
      lines: [{ variantId: 'v-ch', variantSku: 'P-CH' }],
    });
    expect(resolveCost({ products, articles, productId: 'p', size: 'medium' }).total).toBe(4500);
    expectError(
      () => resolveCost({ products, articles, productId: 'p', size: 'large' }),
      'NO_MATCHING_VARIANT',
    );
  });

  it('un tamaño literal empareja por sizeId sin importar el tamaño producido', () => {
    const products = product([
      {
        id: 'pl',
        kind: 'article',
        category: 'material',
        articleId: 'planta',
        variantSize: 'medium',
        quantity: 1,
      },
    ]);
    expect(resolveCost({ products, articles, productId: 'p', size: 'small' }).total).toBe(4500);
  });

  it('el filtro solo considera variantes activas; elegir una inactiva no se permite', () => {
    const products = product([
      {
        id: 'mac',
        kind: 'article',
        category: 'material',
        articleId: 'maceta',
        attributeFilter: { forma: 'redonda' },
        quantity: 1,
      },
    ]);
    expect(resolveCost({ products, articles, productId: 'p', size: 'small' })).toMatchObject({
      total: 1500,
      lines: [{ variantId: 'm-gr', variantInactive: false }],
    });
    expectError(
      () =>
        resolveCost({
          products,
          articles,
          productId: 'p',
          size: 'small',
          variantChoices: { mac: 'm-bl' },
        }),
      'VARIANT_NOT_ALLOWED',
    );
  });

  it('una variante fija se resuelve aunque esté inactiva y la línea lo indica', () => {
    const products = product([
      {
        id: 'mac',
        kind: 'article',
        category: 'material',
        articleId: 'maceta',
        variantId: 'm-ne',
        quantity: 1,
      },
    ]);
    expect(resolveCost({ products, articles, productId: 'p', size: 'small' })).toMatchObject({
      total: 2000,
      lines: [{ variantId: 'm-ne', variantSku: 'M-NE', variantInactive: true }],
    });
  });

  it('una variante fija que no es del artículo no coincide', () => {
    const products = product([
      {
        id: 'mac',
        kind: 'article',
        category: 'material',
        articleId: 'maceta',
        variantId: 'v-ch',
        quantity: 1,
      },
    ]);
    expectError(
      () => resolveCost({ products, articles, productId: 'p', size: 'small' }),
      'NO_MATCHING_VARIANT',
    );
  });
});

describe('previewCost · requiere elegir variante', () => {
  it('Cactus chica: no toma la primera ni promedia; pide elegir entre las dos macetas', () => {
    const preview = previewCost({
      products: sampleProducts,
      articles: sampleArticles,
      productId: 'cactus-maceta-concreto',
      size: 'chico',
    });

    expect(preview.total).toBeNull();
    expect(preview.pendingChoices).toEqual([
      {
        componentId: 'cm-maceta',
        articleId: 'maceta-concreto',
        candidates: [
          {
            variantId: 'MAC-CON-R08-GR',
            sku: 'MAC-CON-R08-GR',
            sizeId: null,
            attributes: { forma: 'redonda', diametro: 8, color: 'gris' },
            unitCost: 1500,
          },
          {
            variantId: 'MAC-CON-R08-BL',
            sku: 'MAC-CON-R08-BL',
            sizeId: null,
            attributes: { forma: 'redonda', diametro: 8, color: 'blanco' },
            unitCost: 1500,
          },
        ],
      },
    ]);
    expect(line(preview as CostBreakdown, 'cm-maceta')).toMatchObject({
      variantId: null,
      unitCost: null,
      subtotal: null,
    });
    // Las demás líneas sí se resuelven para mostrarlas.
    expect(line(preview as CostBreakdown, 'pm-arm').subtotal).toBe(800);
  });

  it('con la elección da el mismo desglose que resolveCost', () => {
    const input = {
      products: sampleProducts,
      articles: sampleArticles,
      productId: 'cactus-maceta-concreto',
      size: 'chico',
      variantChoices: { 'cm-maceta': 'MAC-CON-R08-GR' },
    };
    const preview = previewCost(input);
    expect(preview.pendingChoices).toEqual([]);
    expect(preview.total).toBe(4550);
    expect(preview.lines).toEqual(resolveCost(input).lines);
  });

  it('Kokedama Nochebuena chica: sin elecciones pendientes y total $53.10', () => {
    const preview = previewCost({
      products: sampleProducts,
      articles: sampleArticles,
      productId: 'kokedama-nochebuena',
      size: 'chico',
    });
    expect(preview).toMatchObject({ total: 5310, pendingChoices: [] });
  });

  it('los demás errores se siguen lanzando', () => {
    expectError(
      () =>
        previewCost({
          products: sampleProducts,
          articles: sampleArticles,
          productId: 'kokedama-helecho',
          size: 'grande',
        }),
      'SIZE_NOT_OFFERED',
    );
  });
});
