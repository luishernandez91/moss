import { describe, expect, it, vi } from 'vitest';
import { businessDate, type Clock } from './business-date.js';
import { resolveCost } from './cost-resolution.js';
import { cents, type Cents } from './money.js';
import {
  evaluateMargin,
  PriceResolutionError,
  resolvePrice,
  type PersistedCampaignStatus,
  type PriceListLookup,
  type PriceResolutionErrorCode,
  type ResolvePriceInput,
} from './price-resolution.js';
import {
  pesos,
  sampleAddOn,
  sampleAddOnPrice,
  sampleArticles,
  sampleProductPrice,
  sampleProducts,
  sampleVariantPrice,
} from './test-fixtures/sample-catalog.js';

const clockAt = (iso: string): Clock => ({ now: () => new Date(iso) });

/** 10 dic 2026, mediodía en Ciudad de México: dentro de la campaña de temporada. */
const DURING = clockAt('2026-12-10T18:00:00Z');

const seasonCampaign = (
  status: PersistedCampaignStatus = 'scheduled',
): ResolvePriceInput['campaign'] => ({
  status,
  startDate: businessDate('2026-12-01'),
  endDate: businessDate('2026-12-24'),
});

const nochebuenaChicaCost = (addOn?: string): Cents =>
  resolveCost({
    products: sampleProducts,
    articles: sampleArticles,
    productId: 'kokedama-nochebuena',
    size: 'chico',
    ...(addOn !== undefined && { addOn: sampleAddOn(addOn) }),
  }).total;

function nochebuenaChica(overrides: Partial<ResolvePriceInput> = {}): ResolvePriceInput {
  return {
    item: { kind: 'product', productId: 'kokedama-nochebuena', size: 'chico' },
    quantity: 1,
    unitCost: nochebuenaChicaCost(),
    generalPrice: sampleProductPrice('kokedama-nochebuena', 'chico'),
    campaign: seasonCampaign(),
    minMarginPercent: 30,
    clock: DURING,
    ...overrides,
  };
}

function expectError(fn: () => unknown, code: PriceResolutionErrorCode, message?: RegExp) {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(PriceResolutionError);
  expect((caught as PriceResolutionError).code).toBe(code);
  if (message) {
    expect((caught as PriceResolutionError).message).toMatch(message);
  }
}

describe('resolvePrice · casos de la especificación', () => {
  it('§10: precio especial $50 sobre costo $53.10 da aviso de margen negativo', () => {
    const result = resolvePrice(
      nochebuenaChica({ specialPrice: { price: pesos(50), requiresReview: false } }),
    );

    expect(result.unitCost).toBe(5310);
    expect(result.appliedPrice).toBe(5000);
    expect(result.source).toBe('campaign');
    expect(result.listPrice).toBe(12000);
    expect(result.marginPercent).toBeCloseTo(-6.2, 10);
    expect(result.marginPercent!).toBeLessThan(0);
    expect(result.warning).toBe('below_cost');
    expect(result.ignoredSpecialPrice).toBeNull();
  });

  it('sin precio especial usa el precio general del tamaño: $120, margen 55.75%', () => {
    const result = resolvePrice(nochebuenaChica());

    expect(result).toMatchObject({
      appliedPrice: 12000,
      listPrice: 12000,
      source: 'general',
      warning: null,
      ignoredSpecialPrice: null,
    });
    expect(result.marginPercent).toBeCloseTo(55.75, 10);
  });

  it('variante vendida sola: Nochebuena chica, costo $30, precio $90', () => {
    const result = resolvePrice(
      nochebuenaChica({
        item: { kind: 'variant', variantSku: 'PLA-NOC-CH' },
        unitCost: pesos(30),
        generalPrice: sampleVariantPrice('PLA-NOC-CH'),
      }),
    );

    expect(result).toMatchObject({ appliedPrice: 9000, source: 'general', warning: null });
    expect(result.marginPercent).toBeCloseTo(66.666_666, 5);
  });
});

describe('resolvePrice · orden de resolución', () => {
  const special = { price: pesos(100), requiresReview: false };
  const listOf =
    (price: number | null): PriceListLookup =>
    () =>
      price === null ? null : pesos(price);

  it('el ajuste manual gana al precio especial y a la lista', () => {
    const result = resolvePrice(
      nochebuenaChica({
        manual: { price: pesos(110), reason: 'Cliente frecuente' },
        specialPrice: special,
        priceList: listOf(115),
      }),
    );

    expect(result).toMatchObject({ appliedPrice: 11000, source: 'manual', listPrice: 11500 });
  });

  it('el precio especial gana a la lista', () => {
    const result = resolvePrice(nochebuenaChica({ specialPrice: special, priceList: listOf(115) }));

    expect(result).toMatchObject({ appliedPrice: 10000, source: 'campaign', listPrice: 11500 });
  });

  it('la lista gana al precio general y recibe artículo, cantidad, fecha de hoy y canal', () => {
    const lookup = vi.fn<PriceListLookup>(() => pesos(115));

    const result = resolvePrice(
      nochebuenaChica({ priceList: lookup, quantity: 3, channel: 'tianguis' }),
    );

    expect(result).toMatchObject({ appliedPrice: 11500, source: 'list', listPrice: 11500 });
    expect(lookup).toHaveBeenCalledWith({
      item: { kind: 'product', productId: 'kokedama-nochebuena', size: 'chico' },
      quantity: 3,
      date: '2026-12-10',
      channel: 'tianguis',
    });
  });

  it('una venta atrasada consulta la lista con su fecha; el precio especial usa hoy', () => {
    const lookup = vi.fn<PriceListLookup>(() => pesos(115));

    const result = resolvePrice(
      nochebuenaChica({
        clock: clockAt('2027-01-05T18:00:00Z'),
        saleDate: businessDate('2026-12-20'),
        priceList: lookup,
        specialPrice: { price: pesos(100), requiresReview: false },
      }),
    );

    expect(lookup).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-12-20' }));
    expect(result.source).toBe('campaign');
  });

  it('si la lista no tiene precio, cae al precio general', () => {
    const result = resolvePrice(nochebuenaChica({ priceList: listOf(null) }));

    expect(result).toMatchObject({ appliedPrice: 12000, source: 'general', listPrice: 12000 });
  });

  it('un precio especial nulo no cuenta', () => {
    const result = resolvePrice(nochebuenaChica({ specialPrice: null }));

    expect(result.source).toBe('general');
  });
});

describe('resolvePrice · ajuste manual', () => {
  it.each(['', '   '])('exige motivo (motivo «%s»)', (reason) => {
    expectError(
      () => resolvePrice(nochebuenaChica({ manual: { price: pesos(100), reason } })),
      'MANUAL_REASON_REQUIRED',
      /motivo/,
    );
  });

  it('acepta precio manual sin precio general', () => {
    const result = resolvePrice(
      nochebuenaChica({ generalPrice: null, manual: { price: pesos(100), reason: 'Muestra' } }),
    );

    expect(result).toMatchObject({ appliedPrice: 10000, source: 'manual', listPrice: null });
  });

  it('un precio manual de $0 se permite y avisa que queda bajo el costo', () => {
    const result = resolvePrice(nochebuenaChica({ manual: { price: pesos(0), reason: 'Regalo' } }));

    expect(result).toMatchObject({
      appliedPrice: 0,
      source: 'manual',
      marginPercent: null,
      warning: 'below_cost',
    });
  });
});

describe('resolvePrice · precio especial según la campaña', () => {
  const special = { price: pesos(100), requiresReview: false };

  it.each<PersistedCampaignStatus>(['draft', 'closed', 'cancelled'])(
    'no aplica en una campaña %s',
    (status) => {
      const result = resolvePrice(
        nochebuenaChica({ campaign: seasonCampaign(status), specialPrice: special }),
      );

      expect(result).toMatchObject({
        appliedPrice: 12000,
        source: 'general',
        ignoredSpecialPrice: 'campaign_not_open',
      });
    },
  );

  it('no aplica en una campaña programada que todavía no empieza', () => {
    const result = resolvePrice(
      nochebuenaChica({ clock: clockAt('2026-11-18T18:00:00Z'), specialPrice: special }),
    );

    expect(result).toMatchObject({ source: 'general', ignoredSpecialPrice: 'campaign_not_open' });
  });

  it('no aplica en una campaña programada sin fecha de inicio', () => {
    const result = resolvePrice(
      nochebuenaChica({
        campaign: { status: 'scheduled', startDate: null, endDate: null },
        specialPrice: special,
      }),
    );

    expect(result).toMatchObject({ source: 'general', ignoredSpecialPrice: 'campaign_not_open' });
  });

  it('no aplica si el precio especial está marcado para revisión', () => {
    const result = resolvePrice(
      nochebuenaChica({ specialPrice: { price: pesos(100), requiresReview: true } }),
    );

    expect(result).toMatchObject({
      appliedPrice: 12000,
      source: 'general',
      ignoredSpecialPrice: 'requires_review',
    });
  });

  it('«hoy» se calcula en America/Mexico_City: 05:59 UTC del 1 dic todavía es 30 nov', () => {
    const before = resolvePrice(
      nochebuenaChica({ clock: clockAt('2026-12-01T05:59:00Z'), specialPrice: special }),
    );
    const after = resolvePrice(
      nochebuenaChica({ clock: clockAt('2026-12-01T06:00:00Z'), specialPrice: special }),
    );

    expect(before.source).toBe('general');
    expect(after.source).toBe('campaign');
  });

  it.each([
    ['el día de inicio', '2026-12-01T18:00:00Z'],
    ['el día fin', '2026-12-24T18:00:00Z'],
    ['después del fin, por cerrar', '2027-01-05T18:00:00Z'],
  ])('aplica %s', (_label, iso) => {
    const result = resolvePrice(nochebuenaChica({ clock: clockAt(iso), specialPrice: special }));

    expect(result).toMatchObject({ appliedPrice: 10000, source: 'campaign' });
  });

  it('un ajuste manual no reporta el precio especial como ignorado', () => {
    const result = resolvePrice(
      nochebuenaChica({
        manual: { price: pesos(110), reason: 'Cliente frecuente' },
        specialPrice: { price: pesos(100), requiresReview: true },
      }),
    );

    expect(result.ignoredSpecialPrice).toBeNull();
  });
});

describe('resolvePrice · extras', () => {
  const reno = { id: 'reno', price: sampleAddOnPrice('reno') };
  const withReno = (overrides: Partial<ResolvePriceInput> = {}) =>
    nochebuenaChica({ unitCost: nochebuenaChicaCost('reno'), addOn: reno, ...overrides });

  it('precio general + Reno: $120 + $59 = $179', () => {
    const result = resolvePrice(withReno());

    expect(result.unitCost).toBe(7160);
    expect(result).toMatchObject({ appliedPrice: 17900, listPrice: 17900, source: 'general' });
  });

  it('precio especial + Reno: $100 + $59 = $159', () => {
    const result = resolvePrice(
      withReno({ specialPrice: { price: pesos(100), requiresReview: false } }),
    );

    expect(result).toMatchObject({ appliedPrice: 15900, listPrice: 17900, source: 'campaign' });
  });

  it('precio de lista + Reno: $115 + $59 = $174', () => {
    const result = resolvePrice(withReno({ priceList: () => pesos(115) }));

    expect(result).toMatchObject({ appliedPrice: 17400, listPrice: 17400, source: 'list' });
  });

  it('el ajuste manual es el precio total de la pieza: no suma el extra', () => {
    const result = resolvePrice(withReno({ manual: { price: pesos(150), reason: 'Paquete' } }));

    expect(result).toMatchObject({ appliedPrice: 15000, listPrice: 17900, source: 'manual' });
  });
});

describe('evaluateMargin', () => {
  it('margen exactamente igual al mínimo no avisa', () => {
    expect(evaluateMargin(cents(7000), cents(10000), 30)).toEqual({
      marginPercent: 30,
      warning: null,
    });
  });

  it('un centavo abajo del mínimo avisa', () => {
    const result = evaluateMargin(cents(7000), cents(9999), 30);

    expect(result.warning).toBe('below_min_margin');
    expect(result.marginPercent).toBeCloseTo(29.993, 3);
  });

  it('$70 sobre costo $53.10 queda bajo el margen mínimo de 30%', () => {
    const result = evaluateMargin(cents(5310), cents(7000), 30);

    expect(result.warning).toBe('below_min_margin');
    expect(result.marginPercent).toBeCloseTo(24.142_857, 5);
  });

  it('precio igual al costo queda bajo el margen mínimo, no bajo el costo', () => {
    expect(evaluateMargin(cents(5310), cents(5310), 30)).toEqual({
      marginPercent: 0,
      warning: 'below_min_margin',
    });
  });

  it('con mínimo 0 solo avisa bajo el costo', () => {
    expect(evaluateMargin(cents(5310), cents(5310), 0).warning).toBeNull();
    expect(evaluateMargin(cents(5310), cents(5309), 0).warning).toBe('below_cost');
  });

  it('acepta un mínimo fraccionario', () => {
    expect(evaluateMargin(cents(7000), cents(10000), 30.5).warning).toBe('below_min_margin');
    expect(evaluateMargin(cents(6950), cents(10000), 30.5).warning).toBeNull();
  });

  it.each([
    [9757, 11000, 11.3],
    [10351, 11000, 5.9],
    [1929, 3000, 35.7],
  ])(
    'un margen exactamente igual a un mínimo decimal no avisa (costo %i, precio %i, mínimo %s%)',
    (cost, price, min) => {
      expect(evaluateMargin(cents(cost), cents(price), min).warning).toBeNull();
      expect(evaluateMargin(cents(cost + 1), cents(price), min).warning).toBe('below_min_margin');
    },
  );

  it('precio $0 y costo $0: sin aviso y margen indefinido', () => {
    expect(evaluateMargin(cents(0), cents(0), 30)).toEqual({ marginPercent: null, warning: null });
  });

  it.each([-1, 100, 120, Number.NaN, Number.POSITIVE_INFINITY])(
    'rechaza un margen mínimo inválido (%s)',
    (minMarginPercent) => {
      expectError(
        () => evaluateMargin(cents(100), cents(200), minMarginPercent),
        'INVALID_MIN_MARGIN',
      );
    },
  );

  it('rechaza montos negativos', () => {
    expectError(() => evaluateMargin(cents(-1), cents(200), 30), 'NEGATIVE_AMOUNT');
    expectError(() => evaluateMargin(cents(100), cents(-200), 30), 'NEGATIVE_AMOUNT');
  });
});

describe('resolvePrice · errores', () => {
  it('sin precio general ni otro origen: NO_PRICE (Kokedama Helecho grande)', () => {
    const generalPrice = sampleProductPrice('kokedama-helecho', 'grande');
    expect(generalPrice).toBeNull();

    expectError(
      () =>
        resolvePrice(
          nochebuenaChica({
            item: { kind: 'product', productId: 'kokedama-helecho', size: 'grande' },
            generalPrice,
          }),
        ),
      'NO_PRICE',
      /precio/,
    );
  });

  it('un precio especial que no aplica no evita NO_PRICE', () => {
    expectError(
      () =>
        resolvePrice(
          nochebuenaChica({
            generalPrice: null,
            specialPrice: { price: pesos(100), requiresReview: true },
          }),
        ),
      'NO_PRICE',
    );
  });

  it('el precio especial vigente basta aunque no haya precio general', () => {
    const result = resolvePrice(
      nochebuenaChica({
        generalPrice: null,
        specialPrice: { price: pesos(100), requiresReview: false },
      }),
    );

    expect(result).toMatchObject({ appliedPrice: 10000, source: 'campaign', listPrice: null });
  });

  it.each<[string, Partial<ResolvePriceInput>]>([
    ['costo', { unitCost: cents(-1) }],
    ['precio general', { generalPrice: cents(-1) }],
    ['precio especial', { specialPrice: { price: cents(-1), requiresReview: false } }],
    ['precio manual', { manual: { price: cents(-1), reason: 'x' } }],
    ['precio del extra', { addOn: { id: 'reno', price: cents(-1) } }],
    ['precio de lista', { priceList: () => cents(-1) }],
  ])('rechaza un %s negativo', (_label, overrides) => {
    expectError(() => resolvePrice(nochebuenaChica(overrides)), 'NEGATIVE_AMOUNT');
  });

  it.each<[string, Partial<ResolvePriceInput>]>([
    ['costo', { unitCost: 5310.5 as Cents }],
    ['precio general', { generalPrice: 120.5 as Cents }],
    ['precio de lista', { priceList: () => 115.5 as Cents }],
  ])('rechaza un %s que no es entero de centavos', (_label, overrides) => {
    expectError(() => resolvePrice(nochebuenaChica(overrides)), 'INVALID_AMOUNT', /entero/);
  });

  it('rechaza un extra en una variante vendida sola', () => {
    expectError(
      () =>
        resolvePrice(
          nochebuenaChica({
            item: { kind: 'variant', variantSku: 'PLA-NOC-CH' },
            unitCost: pesos(30),
            generalPrice: sampleVariantPrice('PLA-NOC-CH'),
            addOn: { id: 'reno', price: sampleAddOnPrice('reno') },
          }),
        ),
      'ADDON_NOT_ALLOWED',
    );
  });

  it.each([0, -1, 1.5, Number.NaN])('rechaza la cantidad %s', (quantity) => {
    expectError(() => resolvePrice(nochebuenaChica({ quantity })), 'INVALID_QUANTITY');
  });

  it('rechaza un margen mínimo inválido', () => {
    expectError(
      () => resolvePrice(nochebuenaChica({ minMarginPercent: 100 })),
      'INVALID_MIN_MARGIN',
    );
  });
});
