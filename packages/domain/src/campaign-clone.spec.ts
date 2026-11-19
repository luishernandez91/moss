import { describe, expect, it } from 'vitest';
import { cents, fromPesos, ZERO } from './money.js';
import {
  cloneCampaign,
  cloneCampaignName,
  CampaignCloneError,
  type CampaignCloneErrorCode,
  type CatalogCostLookup,
  type CloneCampaignInput,
  type CloneSourceItem,
} from './campaign-clone.js';

const money = fromPesos;

function ids(...values: string[]): () => string {
  const queue = [...values];
  return () => {
    const next = queue.shift();
    if (next === undefined) {
      throw new Error('El generador de prueba se quedó sin IDs');
    }
    return next;
  };
}

function item(overrides: Partial<CloneSourceItem> = {}): CloneSourceItem {
  return {
    id: 'item-1',
    productId: 'kokedama-nochebuena',
    variantId: null,
    sizeId: 'chica',
    campaignCost: money('53.10'),
    costOrigin: 'catalog',
    specialPrice: null,
    specialPriceReason: null,
    requiresReview: false,
    active: true,
    ...overrides,
  };
}

function base(overrides: Partial<CloneCampaignInput> = {}): CloneCampaignInput {
  return {
    campaign: {
      id: 'navidad-2026',
      name: 'Navidad 2026',
      type: 'temporada',
      budget: money('3000'),
      reinvestmentBps: 3000,
      notes: 'Tianguis de diciembre',
      status: 'closed',
    },
    items: [item()],
    costSource: 'original',
    newId: ids('clon', 'clon-item-1', 'clon-item-2', 'clon-item-3'),
    ...overrides,
  };
}

function expectError(input: CloneCampaignInput, code: CampaignCloneErrorCode) {
  let caught: unknown;
  try {
    cloneCampaign(input);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(CampaignCloneError);
  expect((caught as CampaignCloneError).code).toBe(code);
  expect((caught as CampaignCloneError).message).toMatch(/[a-záéíóúñ]/);
}

describe('cloneCampaign', () => {
  it('§5 pantalla 12: produce un borrador sin fechas con nombre, tipo, presupuesto, reinversión, notas e items', () => {
    expect(cloneCampaign(base())).toEqual({
      campaign: {
        id: 'clon',
        name: 'Navidad 2026 (copia)',
        type: 'temporada',
        budget: money('3000'),
        reinvestmentBps: 3000,
        notes: 'Tianguis de diciembre',
        status: 'draft',
        startDate: null,
        endDate: null,
        clonedFromId: 'navidad-2026',
        leftoverInventory: ZERO,
        closedAt: null,
      },
      items: [
        {
          id: 'clon-item-1',
          campaignId: 'clon',
          productId: 'kokedama-nochebuena',
          variantId: null,
          sizeId: 'chica',
          campaignCost: money('53.10'),
          costOrigin: 'catalog',
          specialPrice: null,
          specialPriceReason: null,
          requiresReview: false,
          active: true,
        },
      ],
      warnings: [],
    });
  });

  it('pide los IDs al generador: primero la campaña y luego los items en orden de entrada', () => {
    const output = cloneCampaign(
      base({
        items: [item({ id: 'b' }), item({ id: 'a', productId: null, variantId: 'hilo' })],
      }),
    );
    expect(output.campaign.id).toBe('clon');
    expect(output.items.map((entry) => [entry.id, entry.variantId])).toEqual([
      ['clon-item-1', null],
      ['clon-item-2', 'hilo'],
    ]);
  });

  it('clona una campaña cancelada (§5: Cancelada → Clonar)', () => {
    expect(
      cloneCampaign(base({ campaign: { ...base().campaign, status: 'cancelled' } })).campaign
        .status,
    ).toBe('draft');
  });

  it('solo se clonan cerradas y canceladas', () => {
    for (const status of ['draft', 'scheduled'] as const) {
      expectError(base({ campaign: { ...base().campaign, status } }), 'CLONE_NOT_ALLOWED');
    }
    expect(() =>
      cloneCampaign(base({ campaign: { ...base().campaign, status: 'draft' } })),
    ).toThrow('Solo se pueden clonar campañas cerradas o canceladas.');
  });

  it('conserva las notas sin notas como null', () => {
    expect(
      cloneCampaign(base({ campaign: { ...base().campaign, notes: null } })).campaign.notes,
    ).toBeNull();
  });

  it('copia precios especiales marcados para revisión', () => {
    const [copy] = cloneCampaign(
      base({
        items: [item({ specialPrice: money('65'), specialPriceReason: 'Precio de temporada' })],
      }),
    ).items;
    expect(copy).toMatchObject({
      specialPrice: money('65'),
      specialPriceReason: 'Precio de temporada',
      requiresReview: true,
    });
  });

  it('sin precio especial no marca revisión ni conserva un motivo huérfano', () => {
    const [copy] = cloneCampaign(
      base({ items: [item({ requiresReview: true, specialPriceReason: 'viejo' })] }),
    ).items;
    expect(copy).toMatchObject({
      specialPrice: null,
      specialPriceReason: null,
      requiresReview: false,
    });
  });

  it('costos de la original: conserva catálogo y manual, y compra pasa a manual', () => {
    const output = cloneCampaign(
      base({
        items: [
          item({ id: 'a', costOrigin: 'catalog', campaignCost: money('30') }),
          item({ id: 'b', costOrigin: 'manual', campaignCost: money('28') }),
          item({ id: 'c', costOrigin: 'purchase', campaignCost: money('25.50') }),
        ],
      }),
    );
    expect(output.items.map((entry) => [entry.campaignCost, entry.costOrigin])).toEqual([
      [money('30'), 'catalog'],
      [money('28'), 'manual'],
      [money('25.50'), 'manual'],
    ]);
    expect(output.warnings).toEqual([]);
  });

  it('copia los items inactivos de la original como inactivos', () => {
    const [copy] = cloneCampaign(base({ items: [item({ active: false })] })).items;
    expect(copy!.active).toBe(false);
  });

  it('costos del catálogo: toma el costo vigente con origen catálogo', () => {
    const seen: string[] = [];
    const catalogCost: CatalogCostLookup = (source) => {
      seen.push(source.id);
      return { status: 'available', cost: money('55') };
    };
    const [copy] = cloneCampaign(
      base({
        costSource: 'catalog',
        catalogCost,
        items: [item({ costOrigin: 'purchase', campaignCost: money('50') })],
      }),
    ).items;
    expect(seen).toEqual(['item-1']);
    expect(copy).toMatchObject({ campaignCost: money('55'), costOrigin: 'catalog', active: true });
  });

  it('un item no disponible en el catálogo conserva su costo, queda inactivo y genera un aviso', () => {
    const output = cloneCampaign(
      base({
        costSource: 'catalog',
        catalogCost: (source) =>
          source.id === 'descontinuada'
            ? { status: 'unavailable' }
            : { status: 'available', cost: money('31') },
        items: [
          item({ id: 'vigente' }),
          item({
            id: 'descontinuada',
            costOrigin: 'purchase',
            campaignCost: money('40'),
            specialPrice: money('70'),
            specialPriceReason: 'Promoción',
          }),
        ],
      }),
    );
    expect(output.items[1]).toEqual({
      id: 'clon-item-2',
      campaignId: 'clon',
      productId: 'kokedama-nochebuena',
      variantId: null,
      sizeId: 'chica',
      campaignCost: money('40'),
      costOrigin: 'manual',
      specialPrice: money('70'),
      specialPriceReason: 'Promoción',
      // requiresReview es exclusivo del precio especial (D3), no del catálogo.
      requiresReview: true,
      active: false,
    });
    expect(output.items[0]).toMatchObject({ campaignCost: money('31'), active: true });
    expect(output.warnings).toEqual([
      {
        code: 'CATALOG_ITEM_UNAVAILABLE',
        sourceItemId: 'descontinuada',
        itemId: 'clon-item-2',
        message: expect.stringMatching(/catálogo/),
      },
    ]);
  });

  it('un item no disponible sin precio especial no se marca para revisión', () => {
    const output = cloneCampaign(
      base({ costSource: 'catalog', catalogCost: () => ({ status: 'unavailable' }) }),
    );
    expect(output.items[0]).toMatchObject({ requiresReview: false, active: false });
    expect(output.warnings).toHaveLength(1);
  });

  it('exige la consulta de catálogo cuando se eligen costos del catálogo', () => {
    expectError(base({ costSource: 'catalog' }), 'CATALOG_LOOKUP_REQUIRED');
  });

  it('valida el costo que devuelve el catálogo', () => {
    expectError(
      base({
        costSource: 'catalog',
        catalogCost: () => ({ status: 'available', cost: cents(-1) }),
      }),
      'NEGATIVE_AMOUNT',
    );
    expectError(
      base({
        costSource: 'catalog',
        catalogCost: () => ({ status: 'available', cost: 1.5 as never }),
      }),
      'INVALID_AMOUNT',
    );
  });

  it('clona una campaña sin items', () => {
    expect(cloneCampaign(base({ items: [] })).items).toEqual([]);
  });

  it('valida los IDs generados: no vacíos, distintos entre sí y de los originales', () => {
    expectError(base({ newId: ids(' ', 'x') }), 'INVALID_GENERATED_ID');
    expectError(base({ newId: ids('clon', 'clon') }), 'INVALID_GENERATED_ID');
    expectError(base({ newId: ids('navidad-2026', 'x') }), 'INVALID_GENERATED_ID');
    expectError(base({ newId: ids('clon', 'item-1') }), 'INVALID_GENERATED_ID');
  });

  it('valida los datos de la campaña original', () => {
    const campaign = base().campaign;
    expectError(base({ campaign: { ...campaign, name: '  ' } }), 'INVALID_CAMPAIGN');
    expectError(base({ campaign: { ...campaign, type: '' } }), 'INVALID_CAMPAIGN');
    expectError(base({ campaign: { ...campaign, budget: cents(-1) } }), 'NEGATIVE_AMOUNT');
    expectError(base({ campaign: { ...campaign, budget: 0.5 as never } }), 'INVALID_AMOUNT');
    for (const reinvestmentBps of [-1, 10001, 1.5]) {
      expectError(base({ campaign: { ...campaign, reinvestmentBps } }), 'INVALID_REINVESTMENT');
    }
  });

  it('valida los items: producto o variante exclusivos (§9), IDs únicos y montos', () => {
    expectError(base({ items: [item({ variantId: 'hilo' })] }), 'INVALID_ITEM');
    expectError(base({ items: [item({ productId: null })] }), 'INVALID_ITEM');
    expectError(base({ items: [item({ productId: '  ', variantId: 'hilo' })] }), 'INVALID_ITEM');
    expectError(base({ items: [item({ variantId: ' ' })] }), 'INVALID_ITEM');
    expectError(base({ items: [item(), item()] }), 'INVALID_ITEM');
    expectError(base({ items: [item({ campaignCost: cents(-1) })] }), 'NEGATIVE_AMOUNT');
    expectError(base({ items: [item({ specialPrice: 0.5 as never })] }), 'INVALID_AMOUNT');
  });

  it('no muta la entrada', () => {
    const input = base({ items: [item({ costOrigin: 'purchase', specialPrice: money('60') })] });
    const snapshot = structuredClone({ campaign: input.campaign, items: input.items });
    cloneCampaign(input);
    expect({ campaign: input.campaign, items: input.items }).toEqual(snapshot);
  });
});

describe('cloneCampaignName', () => {
  it('agrega «(copia)» al nombre recortado', () => {
    expect(cloneCampaignName('  Navidad 2026 ')).toBe('Navidad 2026 (copia)');
  });

  it('no duplica el sufijo al clonar una copia', () => {
    expect(cloneCampaignName('Navidad 2026 (copia)')).toBe('Navidad 2026 (copia)');
    expect(cloneCampaignName('Navidad 2026 (copia) (copia)')).toBe('Navidad 2026 (copia)');
  });

  it('solo quita el sufijo exacto al final', () => {
    expect(cloneCampaignName('(copia) de Navidad')).toBe('(copia) de Navidad (copia)');
    expect(cloneCampaignName('Navidad (Copia)')).toBe('Navidad (Copia) (copia)');
  });

  it('un nombre que solo es el sufijo queda como «(copia)»', () => {
    expect(cloneCampaignName('(copia)')).toBe('(copia)');
  });
});
