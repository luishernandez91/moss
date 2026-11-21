import { describe, expect, it } from 'vitest';
import { CostResolutionError, previewCost, type CostPreview } from './cost-resolution.js';
import {
  assertComponentsRemovable,
  assertNewReferencesActive,
  assessProductCosts,
  effectiveSizeOffer,
  persistedComponentKey,
  productCostDetail,
  ProductError,
  toCostProducts,
  validateProductCatalog,
  type PersistedArticleComponent,
  type PersistedComponent,
  type PersistedFixedComponent,
  type PersistedProduct,
  type ProductCatalog,
  type ProductErrorCode,
} from './product-catalog.js';
import { cents } from './money.js';
import { sampleArticles, sampleProducts, pesos } from './test-fixtures/sample-catalog.js';
import {
  sampleCatalogArticles,
  samplePersistedComponents,
  samplePersistedProducts,
  sampleProductCatalog,
  sampleSizes,
} from './test-fixtures/sample-persisted.js';

function expectError(fn: () => unknown, code: ProductErrorCode, message?: RegExp) {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ProductError);
  expect((caught as ProductError).code).toBe(code);
  if (message) expect((caught as ProductError).message).toMatch(message);
  return caught as ProductError;
}

type Outcome = { ok: CostPreview } | { error: { code: string; message: string } };

function outcome(run: () => CostPreview): Outcome {
  try {
    return { ok: run() };
  } catch (error) {
    if (error instanceof CostResolutionError) {
      return { error: { code: error.code, message: error.message } };
    }
    throw error;
  }
}

const product = (overrides: Partial<PersistedProduct> & Pick<PersistedProduct, 'id'>) =>
  ({
    parentId: null,
    name: `Producto ${overrides.id}`,
    active: true,
    sizeOffer: { mode: 'inherit' },
    prices: [],
    ...overrides,
  }) satisfies PersistedProduct;

const fixed = (
  overrides: Partial<PersistedFixedComponent> & Pick<PersistedFixedComponent, 'id' | 'productId'>,
): PersistedFixedComponent => ({
  kind: 'fixed',
  category: 'labor',
  concept: `Concepto ${overrides.id}`,
  replacesComponentId: null,
  values: [{ sizeId: null, amount: cents(1000) }],
  ...overrides,
});

const articleComponent = (
  overrides: Partial<PersistedArticleComponent> &
    Pick<PersistedArticleComponent, 'id' | 'productId' | 'articleId'>,
): PersistedArticleComponent => ({
  kind: 'article',
  category: 'material',
  variantId: null,
  attributeFilter: {},
  variantSize: null,
  concept: null,
  replacesComponentId: null,
  values: [{ sizeId: null, quantity: 1 }],
  ...overrides,
});

function withProducts(products: PersistedProduct[], components: PersistedComponent[] = []) {
  return sampleProductCatalog({ products, components });
}

describe('toCostProducts · normalización de C4 a D2', () => {
  it('produce exactamente los productos de D2 del catálogo de ejemplo', () => {
    expect(toCostProducts(samplePersistedProducts, samplePersistedComponents)).toEqual(
      sampleProducts,
    );
  });

  it('conserva sustitución, cobertura y errores de D2 en cada producto y tamaño, no solo totales', () => {
    const normalized = toCostProducts(samplePersistedProducts, samplePersistedComponents);
    const choices: Record<string, string>[] = [{}, { 'cm-maceta': 'MAC-CON-R08-GR' }];
    let compared = 0;
    for (const { id: productId } of samplePersistedProducts) {
      for (const { id: size } of sampleSizes) {
        for (const variantChoices of choices) {
          const direct = outcome(() =>
            previewCost({
              products: sampleProducts,
              articles: sampleArticles,
              productId,
              size,
              variantChoices,
            }),
          );
          const stored = outcome(() =>
            previewCost({
              products: normalized,
              articles: sampleArticles,
              productId,
              size,
              variantChoices,
            }),
          );
          expect(stored, `${productId} ${size}`).toEqual(direct);
          compared += 1;
        }
      }
    }
    expect(compared).toBe(samplePersistedProducts.length * sampleSizes.length * choices.length);
  });

  it('Helecho: la sustitución kh-fab → k-fab sobrevive a la normalización', () => {
    const preview = previewCost({
      products: toCostProducts(samplePersistedProducts, samplePersistedComponents),
      articles: sampleArticles,
      productId: 'kokedama-helecho',
      size: 'chico',
    });
    expect(preview.total).toBe(6285);
    expect(preview.lines.find((line) => line.componentId === 'k-fab')).toMatchObject({
      origin: 'overridden',
      replacedBy: 'kh-fab',
    });
  });

  it('Helecho sin oferta propia sigue exigiendo error al faltar la variante grande', () => {
    const products = samplePersistedProducts.map((candidate) =>
      candidate.id === 'kokedama-helecho'
        ? { ...candidate, sizeOffer: { mode: 'inherit' as const } }
        : candidate,
    );
    expect(
      outcome(() =>
        previewCost({
          products: toCostProducts(products, samplePersistedComponents),
          articles: sampleArticles,
          productId: 'kokedama-helecho',
          size: 'grande',
        }),
      ),
    ).toMatchObject({ error: { code: 'NO_MATCHING_VARIANT' } });
  });

  it('cobertura: un valor por tamaño sin el tamaño pedido es NO_COMPONENT_FOR_SIZE', () => {
    const products = [product({ id: 'a' })];
    const components = [
      fixed({ id: 'fab', productId: 'a', values: [{ sizeId: 'chico', amount: cents(2000) }] }),
    ];
    expect(
      outcome(() =>
        previewCost({
          products: toCostProducts(products, components),
          articles: sampleArticles,
          productId: 'a',
          size: 'grande',
        }),
      ),
    ).toMatchObject({ error: { code: 'NO_COMPONENT_FOR_SIZE' } });
  });
});

describe('effectiveSizeOffer', () => {
  it('lista explícita propia, heredada del ancestro más cercano o sin restricción', () => {
    expect(effectiveSizeOffer(samplePersistedProducts, 'kokedama')).toEqual({
      sizeIds: ['chico', 'mediano', 'grande'],
      definedBy: 'kokedama',
    });
    expect(effectiveSizeOffer(samplePersistedProducts, 'kokedama-nochebuena')).toEqual({
      sizeIds: ['chico', 'mediano', 'grande'],
      definedBy: 'kokedama',
    });
    expect(effectiveSizeOffer(samplePersistedProducts, 'kokedama-helecho')).toEqual({
      sizeIds: ['chico', 'mediano'],
      definedBy: 'kokedama-helecho',
    });
    expect(effectiveSizeOffer(samplePersistedProducts, 'planta-en-maceta')).toEqual({
      sizeIds: null,
      definedBy: null,
    });
  });
});

describe('validateProductCatalog', () => {
  it('acepta el catálogo de ejemplo', () => {
    expect(() => validateProductCatalog(sampleProductCatalog())).not.toThrow();
  });

  it('árbol recursivo: rechaza el cuarto nivel y los ciclos', () => {
    expectError(
      () =>
        validateProductCatalog(
          withProducts([
            product({ id: 'a' }),
            product({ id: 'b', parentId: 'a' }),
            product({ id: 'c', parentId: 'b' }),
            product({ id: 'd', parentId: 'c' }),
          ]),
        ),
      'TREE_TOO_DEEP',
      /3 niveles/,
    );
    expectError(
      () =>
        validateProductCatalog(
          withProducts([
            product({ id: 'a', parentId: 'c' }),
            product({ id: 'b', parentId: 'a' }),
            product({ id: 'c', parentId: 'b' }),
          ]),
        ),
      'CYCLE',
    );
    expectError(
      () => validateProductCatalog(withProducts([product({ id: 'a', parentId: 'a' })])),
      'CYCLE',
    );
    expectError(
      () => validateProductCatalog(withProducts([product({ id: 'a', parentId: 'zz' })])),
      'PARENT_NOT_FOUND',
    );
  });

  it('nombres: recortados, de 1 a 100 caracteres y únicos sin importar mayúsculas', () => {
    expectError(
      () => validateProductCatalog(withProducts([product({ id: 'a', name: '  ' })])),
      'INVALID_PRODUCT_NAME',
    );
    expectError(
      () =>
        validateProductCatalog(
          withProducts([
            product({ id: 'a', name: 'Kokedama' }),
            product({ id: 'b', name: 'KOKEDAMA' }),
          ]),
        ),
      'DUPLICATE_PRODUCT_NAME',
    );
  });

  it('oferta de tamaños: lista explícita no vacía, sin repetidos y con tamaños existentes', () => {
    for (const sizeIds of [[], ['chico', 'chico'], ['enorme']]) {
      expectError(
        () =>
          validateProductCatalog(
            withProducts([product({ id: 'a', sizeOffer: { mode: 'explicit', sizeIds } })]),
          ),
        sizeIds[0] === 'enorme' ? 'SIZE_NOT_FOUND' : 'INVALID_SIZE_OFFER',
      );
    }
  });

  it('precios: uno por tamaño, en centavos y solo para tamaños ofrecidos', () => {
    const offer = { mode: 'explicit' as const, sizeIds: ['chico'] };
    expectError(
      () =>
        validateProductCatalog(
          withProducts([
            product({
              id: 'a',
              sizeOffer: offer,
              prices: [{ sizeId: 'mediano', price: pesos(10) }],
            }),
          ]),
        ),
      'SIZE_NOT_OFFERED',
      /Mediano/,
    );
    expectError(
      () =>
        validateProductCatalog(
          withProducts([
            product({
              id: 'a',
              sizeOffer: offer,
              prices: [
                { sizeId: 'chico', price: pesos(10) },
                { sizeId: 'chico', price: pesos(11) },
              ],
            }),
          ]),
        ),
      'DUPLICATE_PRICE',
    );
    // Sin restricción de tamaños, cualquier tamaño existente admite precio.
    expect(() =>
      validateProductCatalog(
        withProducts([product({ id: 'a', prices: [{ sizeId: 'grande', price: pesos(10) }] })]),
      ),
    ).not.toThrow();
    // Un hijo que restringe la oferta deja fuera los precios de su padre solo para sí mismo.
    expectError(
      () =>
        validateProductCatalog(
          sampleProductCatalog({
            products: samplePersistedProducts.map((candidate) =>
              candidate.id === 'kokedama'
                ? { ...candidate, sizeOffer: { mode: 'explicit', sizeIds: ['chico', 'mediano'] } }
                : candidate,
            ),
          }),
        ),
      'SIZE_NOT_OFFERED',
      /Kokedama Nochebuena.*Grande|Grande.*Kokedama Nochebuena/,
    );
  });

  it('valores: genérico o por tamaño sin mezclar, sin repetir y con cantidades válidas', () => {
    const products = [
      product({ id: 'a', sizeOffer: { mode: 'explicit', sizeIds: ['chico', 'mediano'] } }),
    ];
    const cases: [PersistedComponent, ProductErrorCode][] = [
      [fixed({ id: 'x', productId: 'a', values: [] }), 'INVALID_COMPONENT_VALUES'],
      [
        fixed({
          id: 'x',
          productId: 'a',
          values: [
            { sizeId: null, amount: cents(1) },
            { sizeId: 'chico', amount: cents(2) },
          ],
        }),
        'INVALID_COMPONENT_VALUES',
      ],
      [
        fixed({
          id: 'x',
          productId: 'a',
          values: [
            { sizeId: 'chico', amount: cents(1) },
            { sizeId: 'chico', amount: cents(2) },
          ],
        }),
        'INVALID_COMPONENT_VALUES',
      ],
      [
        fixed({ id: 'x', productId: 'a', values: [{ sizeId: 'grande', amount: cents(1) }] }),
        'SIZE_NOT_OFFERED',
      ],
      [
        fixed({ id: 'x', productId: 'a', values: [{ sizeId: null, amount: -1 as never }] }),
        'INVALID_COMPONENT_VALUES',
      ],
      [
        fixed({ id: 'x', productId: 'a', values: [{ sizeId: null, amount: 1.5 as never }] }),
        'INVALID_COMPONENT_VALUES',
      ],
      [fixed({ id: 'x', productId: 'a', concept: ' ' }), 'INVALID_COMPONENT'],
      [
        articleComponent({
          id: 'x',
          productId: 'a',
          articleId: 'hilo-canamo',
          values: [{ sizeId: null, quantity: 0 }],
        }),
        'INVALID_COMPONENT_VALUES',
      ],
      [
        articleComponent({
          id: 'x',
          productId: 'a',
          articleId: 'hilo-canamo',
          values: [{ sizeId: null, quantity: 0.00001 }],
        }),
        'INVALID_COMPONENT_VALUES',
      ],
    ];
    for (const [component, code] of cases) {
      expectError(() => validateProductCatalog(withProducts(products, [component])), code);
    }
    // Cantidades fraccionarias de hasta 4 decimales.
    expect(() =>
      validateProductCatalog(
        withProducts(products, [
          articleComponent({
            id: 'x',
            productId: 'a',
            articleId: 'tierra-preparada',
            variantId: 'SUS-TIE-20L',
            values: [
              { sizeId: 'chico', quantity: 0.01 },
              { sizeId: 'mediano', quantity: 0.0155 },
            ],
          }),
        ]),
      ),
    ).not.toThrow();
  });

  it('referencias de artículo: existentes, variante del mismo artículo, filtro y tamaño válidos', () => {
    const products = [product({ id: 'a' })];
    const cases: [Partial<PersistedArticleComponent>, ProductErrorCode][] = [
      [{ articleId: 'nada' }, 'ARTICLE_NOT_FOUND'],
      [{ articleId: 'maceta-concreto', variantId: 'PLA-NOC-CH' }, 'VARIANT_NOT_FOUND'],
      [
        {
          articleId: 'maceta-concreto',
          variantId: 'MAC-CON-R08-GR',
          attributeFilter: { forma: 'redonda' },
        },
        'INVALID_COMPONENT',
      ],
      [
        { articleId: 'nochebuena', variantId: 'PLA-NOC-CH', variantSize: { match: 'produced' } },
        'INVALID_COMPONENT',
      ],
      [
        { articleId: 'maceta-concreto', attributeFilter: { material: 'concreto' } },
        'INVALID_ATTRIBUTE_FILTER',
      ],
      [
        { articleId: 'maceta-concreto', attributeFilter: { forma: 'ovalada' } },
        'INVALID_ATTRIBUTE_FILTER',
      ],
      [
        { articleId: 'maceta-concreto', attributeFilter: { diametro: '8' } },
        'INVALID_ATTRIBUTE_FILTER',
      ],
      [
        { articleId: 'maceta-concreto', attributeFilter: { tamano: '{tamano}' } },
        'INVALID_ATTRIBUTE_FILTER',
      ],
      [{ articleId: 'maceta-concreto', variantSize: { match: 'produced' } }, 'SIZE_NOT_ALLOWED'],
      [
        { articleId: 'nochebuena', variantSize: { match: 'size', sizeId: 'enorme' } },
        'SIZE_NOT_FOUND',
      ],
    ];
    for (const [overrides, code] of cases) {
      expectError(
        () =>
          validateProductCatalog(
            withProducts(products, [
              articleComponent({ id: 'x', productId: 'a', articleId: 'nochebuena', ...overrides }),
            ]),
          ),
        code,
      );
    }
  });

  it('componentes repetidos en un producto son DUPLICATE_COMPONENT', () => {
    expectError(
      () =>
        validateProductCatalog(
          withProducts(
            [product({ id: 'a' })],
            [
              fixed({ id: 'x', productId: 'a', concept: 'Fabricación' }),
              fixed({ id: 'y', productId: 'a', concept: 'Fabricación' }),
            ],
          ),
        ),
      'DUPLICATE_COMPONENT',
    );
  });

  it('sustitución: solo de un componente de un ancestro y una sola vez por rama', () => {
    const tree = [
      product({ id: 'a' }),
      product({ id: 'b', parentId: 'a' }),
      product({ id: 'c', parentId: 'b' }),
      product({ id: 'z' }),
    ];
    const base = [fixed({ id: 'fab', productId: 'a', concept: 'Fabricación' })];
    const replace = (id: string, productId: string, target: string) =>
      fixed({ id, productId, concept: `Especial ${id}`, replacesComponentId: target });

    expect(() =>
      validateProductCatalog(
        withProducts(tree, [...base, replace('fab-b', 'b', 'fab'), replace('fab-c', 'c', 'fab-b')]),
      ),
    ).not.toThrow();
    expectError(
      () => validateProductCatalog(withProducts(tree, [...base, replace('fab-z', 'z', 'fab')])),
      'INVALID_REPLACEMENT',
      /no es un componente heredado/,
    );
    expectError(
      () => validateProductCatalog(withProducts(tree, [...base, replace('fab-a', 'a', 'fab')])),
      'INVALID_REPLACEMENT',
    );
    expectError(
      () =>
        validateProductCatalog(
          withProducts(tree, [...base, replace('fab-b', 'b', 'fab'), replace('fab-c', 'c', 'fab')]),
        ),
      'INVALID_REPLACEMENT',
      /ya fue sustituido/,
    );
  });

  it('cambiar el padre que rompe una sustitución se rechaza', () => {
    const products = samplePersistedProducts.map((candidate) =>
      candidate.id === 'kokedama-helecho'
        ? { ...candidate, parentId: 'planta-en-maceta' }
        : candidate,
    );
    expectError(
      () => validateProductCatalog(sampleProductCatalog({ products })),
      'INVALID_REPLACEMENT',
    );
  });
});

describe('assertComponentsRemovable', () => {
  it('un componente que un descendiente sustituye no se puede quitar (409)', () => {
    const error = expectError(
      () => assertComponentsRemovable(sampleProductCatalog(), ['k-fab', 'k-hilo']),
      'COMPONENT_IN_USE',
      /Kokedama Helecho Boston/,
    );
    expect(error.conflict).toEqual([
      { componentId: 'k-fab', productId: 'kokedama-helecho', replacedBy: 'kh-fab' },
    ]);
    expect(() => assertComponentsRemovable(sampleProductCatalog(), ['k-hilo'])).not.toThrow();
  });
});

describe('assertNewReferencesActive', () => {
  const inactiveCatalog = sampleProductCatalog({
    sizes: sampleSizes.map((size) => (size.id === 'mini' ? { ...size, active: false } : size)),
    articles: sampleCatalogArticles.map((article) =>
      article.id === 'poto'
        ? { ...article, active: false }
        : article.id === 'maceta-concreto'
          ? {
              ...article,
              variants: article.variants.map((variant) =>
                variant.id === 'MAC-CON-H06-BL' ? { ...variant, active: false } : variant,
              ),
            }
          : article,
    ),
  });
  const kokedama = samplePersistedProducts.find((candidate) => candidate.id === 'kokedama')!;
  const kokedamaParts = samplePersistedComponents.filter(
    (component) => component.productId === 'kokedama',
  );
  const before = { product: kokedama, components: kokedamaParts };

  it('conserva las referencias existentes a registros desactivados', () => {
    expect(() => assertNewReferencesActive(before, before, inactiveCatalog)).not.toThrow();
    const pricedInMini = {
      product: { ...kokedama, prices: [{ sizeId: 'mini', price: pesos(1) }] },
      components: kokedamaParts,
    };
    expect(() =>
      assertNewReferencesActive(pricedInMini, pricedInMini, inactiveCatalog),
    ).not.toThrow();
  });

  it('rechaza referencias nuevas a tamaños, artículos, variantes o padres desactivados', () => {
    const cases: [Parameters<typeof assertNewReferencesActive>[1], ProductErrorCode][] = [
      [
        {
          product: { ...kokedama, prices: [{ sizeId: 'mini', price: pesos(1) }] },
          components: kokedamaParts,
        },
        'SIZE_INACTIVE',
      ],
      [
        {
          product: kokedama,
          components: [
            ...kokedamaParts,
            articleComponent({ id: 'n', productId: 'kokedama', articleId: 'poto' }),
          ],
        },
        'ARTICLE_INACTIVE',
      ],
      [
        {
          product: kokedama,
          components: [
            ...kokedamaParts,
            articleComponent({ id: 'n', productId: 'kokedama', articleId: 'maceta-ceramica' }),
          ],
        },
        'ARTICLE_NOT_FOR_RECIPES',
      ],
      [
        {
          product: kokedama,
          components: [
            ...kokedamaParts,
            articleComponent({
              id: 'n',
              productId: 'kokedama',
              articleId: 'maceta-concreto',
              variantId: 'MAC-CON-H06-BL',
            }),
          ],
        },
        'VARIANT_INACTIVE',
      ],
      [
        { product: { ...kokedama, parentId: 'planta-en-maceta' }, components: kokedamaParts },
        'PARENT_INACTIVE',
      ],
    ];
    const catalog: ProductCatalog = {
      ...inactiveCatalog,
      products: samplePersistedProducts.map((candidate) =>
        candidate.id === 'planta-en-maceta' ? { ...candidate, active: false } : candidate,
      ),
    };
    for (const [after, code] of cases) {
      expectError(() => assertNewReferencesActive(before, after, catalog), code);
    }
    // Alta nueva: todo lo que referencia es nuevo.
    expectError(
      () =>
        assertNewReferencesActive(
          null,
          {
            product: product({ id: 'n', sizeOffer: { mode: 'explicit', sizeIds: ['mini'] } }),
            components: [],
          },
          catalog,
        ),
      'SIZE_INACTIVE',
    );
  });
});

describe('assessProductCosts y productCostDetail', () => {
  const summary = () => assessProductCosts(sampleProductCatalog(), { minMarginPercent: 0 });
  const sizesOf = (productId: string) =>
    summary().find((row) => row.productId === productId)!.sizes;

  it('Kokedama Nochebuena: costo D2, precio por tamaño y margen D3', () => {
    expect(sizesOf('kokedama-nochebuena')).toEqual([
      {
        sizeId: 'chico',
        status: 'ok',
        cost: 5310,
        price: 12000,
        marginPercent: ((12000 - 5310) / 12000) * 100,
        warning: null,
        error: null,
      },
      {
        sizeId: 'mediano',
        status: 'ok',
        cost: 7465,
        price: 16000,
        marginPercent: ((16000 - 7465) / 16000) * 100,
        warning: null,
        error: null,
      },
      {
        sizeId: 'grande',
        status: 'ok',
        cost: 10675,
        price: 23000,
        marginPercent: ((23000 - 10675) / 23000) * 100,
        warning: null,
        error: null,
      },
    ]);
  });

  it('cantidades fraccionarias: 0.015 bulto × $110 = $1.65 en Kokedama mediana', () => {
    expect(sizesOf('kokedama').find((size) => size.sizeId === 'mediano')).toMatchObject({
      status: 'ok',
      cost: 165 + 300 + 0 + 2500,
      price: null,
      marginPercent: null,
    });
  });

  it('Cactus: «Requiere elegir variante», sin costo ni margen; el precio sí se muestra', () => {
    expect(sizesOf('cactus-maceta-concreto')).toEqual([
      {
        sizeId: 'chico',
        status: 'needs_choice',
        cost: null,
        price: 9500,
        marginPercent: null,
        warning: null,
        error: null,
      },
    ]);
  });

  it('Helecho: solo los tamaños de su oferta', () => {
    expect(sizesOf('kokedama-helecho').map((size) => [size.sizeId, size.cost])).toEqual([
      ['chico', 6285],
      ['mediano', 5500 + 2500 * 0.03 + 3000 + 300 + 165],
    ]);
  });

  it('sin restricción: todos los tamaños activos; un precio ausente es null, sin herencia', () => {
    expect(sizesOf('planta-en-maceta')).toEqual(
      ['mini', 'chico', 'mediano', 'grande'].map((sizeId) => ({
        sizeId,
        status: 'ok',
        cost: 800,
        price: null,
        marginPercent: null,
        warning: null,
        error: null,
      })),
    );
  });

  it('un error de datos se reporta por tamaño y no impide calcular los demás', () => {
    const products = samplePersistedProducts.map((candidate) =>
      candidate.id === 'kokedama-helecho'
        ? { ...candidate, sizeOffer: { mode: 'inherit' as const } }
        : candidate,
    );
    const rows = assessProductCosts(sampleProductCatalog({ products }), { minMarginPercent: 0 });
    const helecho = rows.find((row) => row.productId === 'kokedama-helecho')!.sizes;
    expect(helecho.map((size) => size.status)).toEqual(['ok', 'ok', 'error']);
    expect(helecho[2]!.error).toMatchObject({ code: 'NO_MATCHING_VARIANT' });
  });

  it('avisa precio bajo el costo y bajo el margen mínimo', () => {
    const products = samplePersistedProducts.map((candidate) =>
      candidate.id === 'kokedama-nochebuena'
        ? {
            ...candidate,
            prices: [
              { sizeId: 'chico', price: pesos(50) },
              { sizeId: 'mediano', price: pesos(80) },
            ],
          }
        : candidate,
    );
    const rows = assessProductCosts(sampleProductCatalog({ products }), { minMarginPercent: 10 });
    const sizes = rows.find((row) => row.productId === 'kokedama-nochebuena')!.sizes;
    expect(sizes[0]).toMatchObject({ warning: 'below_cost' });
    expect(sizes[1]).toMatchObject({ warning: 'below_min_margin' });
    expect(sizes[2]).toMatchObject({ price: null, warning: null });
  });

  it('productCostDetail: desglose con candidatas, precio y margen al elegir', () => {
    const pending = productCostDetail(sampleProductCatalog(), {
      productId: 'cactus-maceta-concreto',
      sizeId: 'chico',
      minMarginPercent: 0,
    });
    expect(pending).toMatchObject({ total: null, price: 9500, marginPercent: null });
    expect(pending.pendingChoices[0]!.candidates.map((candidate) => candidate.variantId)).toEqual([
      'MAC-CON-R08-GR',
      'MAC-CON-R08-BL',
    ]);
    const chosen = productCostDetail(sampleProductCatalog(), {
      productId: 'cactus-maceta-concreto',
      sizeId: 'chico',
      variantChoices: { 'cm-maceta': 'MAC-CON-R08-BL' },
      minMarginPercent: 0,
    });
    expect(chosen).toMatchObject({ total: 4550, price: 9500, warning: null });
    expect(chosen.marginPercent).toBeCloseTo(52.1, 1);
  });

  it('productCostDetail rechaza un tamaño fuera de la oferta', () => {
    expect(() =>
      productCostDetail(sampleProductCatalog(), {
        productId: 'kokedama-helecho',
        sizeId: 'grande',
        minMarginPercent: 0,
      }),
    ).toThrow(CostResolutionError);
  });
});

describe('persistedComponentKey', () => {
  it('identifica el mismo componente con la clave de grupo de D2, sin importar su id ni sus valores', () => {
    const fab = samplePersistedComponents.find(
      (component): component is PersistedFixedComponent => component.id === 'k-fab',
    )!;
    const same: PersistedFixedComponent = {
      ...fab,
      id: 'otro-id',
      values: [{ sizeId: null, amount: cents(1) }],
    };
    expect(persistedComponentKey(same)).toBe(persistedComponentKey(fab));
    const keys = samplePersistedComponents
      .filter((component) => component.productId === 'kokedama')
      .map(persistedComponentKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
