/**
 * Clonación de campaña: especificación §5 (diagrama y tabla de estados, pantalla 12) y §9
 * (`campanas.clonada_de_id`, `campana_items`).
 *
 * Copia nombre con «(copia)», tipo, presupuesto, reinversión, notas e items. Nunca copia gastos,
 * aportaciones, producciones, ventas, inventario sobrante, fechas ni bitácora: la función ni
 * siquiera los recibe. El clon nace como borrador. Las participaciones no son por campaña, así que
 * no se copian. Los IDs nuevos salen de un generador inyectado.
 */
import { canClone, type PersistedCampaignStatus } from './campaign-status.js';
import { ZERO, type Cents } from './money.js';

/** En la base: `catalogo`, `compra`, `manual`. */
export type CampaignItemCostOrigin = 'catalog' | 'purchase' | 'manual';

export interface CloneSourceCampaign {
  id: string;
  name: string;
  /** Id del tipo de campaña; necesario para el empalme. */
  type: string;
  budget: Cents;
  /** Puntos base enteros entre 0 y 10000. */
  reinvestmentBps: number;
  notes: string | null;
  status: PersistedCampaignStatus;
}

export interface CloneSourceItem {
  id: string;
  /** Exactamente uno de productId y variantId tiene valor (§9). */
  productId: string | null;
  variantId: string | null;
  sizeId: string | null;
  campaignCost: Cents;
  costOrigin: CampaignItemCostOrigin;
  specialPrice: Cents | null;
  specialPriceReason: string | null;
  requiresReview: boolean;
  active: boolean;
}

/** Costo vigente del catálogo para el item; la API la construye con `resolveCost` (D2). */
export type CatalogCostLookup = (
  item: CloneSourceItem,
) => { status: 'available'; cost: Cents } | { status: 'unavailable' };

export interface CloneCampaignInput {
  campaign: CloneSourceCampaign;
  items: readonly CloneSourceItem[];
  /** «De la campaña original» o «del catálogo» (pantalla 12). */
  costSource: 'original' | 'catalog';
  /** Obligatoria con `costSource: 'catalog'`. */
  catalogCost?: CatalogCostLookup;
  /** Primero se pide el ID de la campaña y luego uno por item, en orden de entrada. */
  newId: () => string;
}

export interface ClonedCampaign {
  id: string;
  name: string;
  type: string;
  budget: Cents;
  reinvestmentBps: number;
  notes: string | null;
  status: 'draft';
  startDate: null;
  endDate: null;
  clonedFromId: string;
  leftoverInventory: Cents;
  closedAt: null;
}

export interface ClonedCampaignItem {
  id: string;
  campaignId: string;
  productId: string | null;
  variantId: string | null;
  sizeId: string | null;
  campaignCost: Cents;
  costOrigin: CampaignItemCostOrigin;
  specialPrice: Cents | null;
  specialPriceReason: string | null;
  /** Exclusivo del precio especial (D3): true si y solo si se copió un precio especial. */
  requiresReview: boolean;
  active: boolean;
}

export interface CampaignCloneWarning {
  code: 'CATALOG_ITEM_UNAVAILABLE';
  sourceItemId: string;
  itemId: string;
  message: string;
}

export interface CampaignClone {
  campaign: ClonedCampaign;
  items: readonly ClonedCampaignItem[];
  warnings: readonly CampaignCloneWarning[];
}

export type CampaignCloneErrorCode =
  | 'CLONE_NOT_ALLOWED'
  | 'INVALID_CAMPAIGN'
  | 'INVALID_REINVESTMENT'
  | 'INVALID_ITEM'
  | 'INVALID_AMOUNT'
  | 'NEGATIVE_AMOUNT'
  | 'CATALOG_LOOKUP_REQUIRED'
  | 'INVALID_GENERATED_ID';

export class CampaignCloneError extends Error {
  override name = 'CampaignCloneError';
  constructor(
    readonly code: CampaignCloneErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const COPY_SUFFIX = '(copia)';
const TRAILING_COPY_SUFFIXES = /(?:\s*\(copia\))+$/;

/**
 * Nombre del clon: recorta, quita los sufijos «(copia)» finales y agrega uno solo.
 * No numera copias: los nombres no son únicos y el borrador se renombra de todos modos.
 */
export function cloneCampaignName(name: string): string {
  const base = name.trim().replace(TRAILING_COPY_SUFFIXES, '').trim();
  return base === '' ? COPY_SUFFIX : `${base} ${COPY_SUFFIX}`;
}

function assertAmount(amount: Cents, label: string): void {
  if (!Number.isSafeInteger(amount)) {
    throw new CampaignCloneError(
      'INVALID_AMOUNT',
      `${label} debe ser un entero seguro de centavos.`,
    );
  }
  if (amount < 0) {
    throw new CampaignCloneError('NEGATIVE_AMOUNT', `${label} no puede ser negativo.`);
  }
}

/** Null o un identificador no vacío; un texto en blanco no es un valor válido. */
function isOptionalId(value: string | null): boolean {
  return value === null || value.trim() !== '';
}

function validateSource(input: CloneCampaignInput): void {
  const { campaign } = input;
  if (!canClone(campaign.status)) {
    throw new CampaignCloneError(
      'CLONE_NOT_ALLOWED',
      'Solo se pueden clonar campañas cerradas o canceladas.',
    );
  }
  if (campaign.id.trim() === '' || campaign.name.trim() === '' || campaign.type.trim() === '') {
    throw new CampaignCloneError(
      'INVALID_CAMPAIGN',
      'La campaña original requiere identificador, nombre y tipo no vacíos.',
    );
  }
  assertAmount(campaign.budget, 'El presupuesto');
  const { reinvestmentBps } = campaign;
  if (!Number.isSafeInteger(reinvestmentBps) || reinvestmentBps < 0 || reinvestmentBps > 10000) {
    throw new CampaignCloneError(
      'INVALID_REINVESTMENT',
      'Los puntos base de reinversión deben ser enteros seguros entre 0 y 10000.',
    );
  }

  const itemIds = new Set<string>();
  for (const item of input.items) {
    if (item.id.trim() === '' || itemIds.has(item.id)) {
      throw new CampaignCloneError(
        'INVALID_ITEM',
        'Cada item requiere un identificador no vacío y distinto.',
      );
    }
    itemIds.add(item.id);
    if (
      !isOptionalId(item.productId) ||
      !isOptionalId(item.variantId) ||
      (item.productId === null) === (item.variantId === null)
    ) {
      throw new CampaignCloneError(
        'INVALID_ITEM',
        `El item «${item.id}» debe tener exactamente un producto o una variante.`,
      );
    }
    assertAmount(item.campaignCost, `El costo de campaña del item «${item.id}»`);
    if (item.specialPrice !== null) {
      assertAmount(item.specialPrice, `El precio especial del item «${item.id}»`);
    }
  }

  if (input.costSource === 'catalog' && input.catalogCost === undefined) {
    throw new CampaignCloneError(
      'CATALOG_LOOKUP_REQUIRED',
      'Para tomar los costos del catálogo se requiere la consulta de costos del catálogo.',
    );
  }
}

/** Origen de un costo copiado de la original: sin el gasto que lo respaldaba, «compra» es manual. */
function copiedOrigin(origin: CampaignItemCostOrigin): CampaignItemCostOrigin {
  return origin === 'purchase' ? 'manual' : origin;
}

/**
 * Clona una campaña cerrada o cancelada como borrador sin fechas. Función pura: no consulta nada
 * fuera de su entrada y no muta la entrada.
 *
 * Costos «de la original»: se copia el costo de campaña; el origen se conserva salvo `purchase`,
 * que pasa a `manual`. Costos «del catálogo»: se usa `catalogCost` con origen `catalog`; si el item
 * no está disponible en el catálogo, conserva su costo (origen ajustado igual), queda `active: false`
 * y genera el aviso `CATALOG_ITEM_UNAVAILABLE`. `requiresReview` es exclusivo de los precios
 * especiales copiados (D3) y nunca se usa para la disponibilidad del catálogo.
 */
export function cloneCampaign(input: CloneCampaignInput): CampaignClone {
  validateSource(input);
  const { campaign } = input;

  const taken = new Set<string>([campaign.id, ...input.items.map((item) => item.id)]);
  const nextId = (): string => {
    const id = input.newId();
    if (typeof id !== 'string' || id.trim() === '' || taken.has(id)) {
      throw new CampaignCloneError(
        'INVALID_GENERATED_ID',
        'El generador debe devolver identificadores no vacíos y distintos de los existentes.',
      );
    }
    taken.add(id);
    return id;
  };

  const campaignId = nextId();
  const warnings: CampaignCloneWarning[] = [];
  const items = input.items.map((item): ClonedCampaignItem => {
    const id = nextId();
    let campaignCost = item.campaignCost;
    let costOrigin = copiedOrigin(item.costOrigin);
    let active = item.active;

    if (input.costSource === 'catalog') {
      // validateSource garantiza la consulta cuando el origen es el catálogo.
      const result = input.catalogCost!(item);
      if (result.status === 'available') {
        assertAmount(result.cost, `El costo de catálogo del item «${item.id}»`);
        campaignCost = result.cost;
        costOrigin = 'catalog';
      } else {
        active = false;
        warnings.push({
          code: 'CATALOG_ITEM_UNAVAILABLE',
          sourceItemId: item.id,
          itemId: id,
          message: `El item «${item.id}» ya no está disponible en el catálogo; se copió inactivo con su costo original.`,
        });
      }
    }

    const hasSpecialPrice = item.specialPrice !== null;
    return {
      id,
      campaignId,
      productId: item.productId,
      variantId: item.variantId,
      sizeId: item.sizeId,
      campaignCost,
      costOrigin,
      specialPrice: item.specialPrice,
      specialPriceReason: hasSpecialPrice ? item.specialPriceReason : null,
      requiresReview: hasSpecialPrice,
      active,
    };
  });

  return {
    campaign: {
      id: campaignId,
      name: cloneCampaignName(campaign.name),
      type: campaign.type,
      budget: campaign.budget,
      reinvestmentBps: campaign.reinvestmentBps,
      notes: campaign.notes,
      status: 'draft',
      startDate: null,
      endDate: null,
      clonedFromId: campaign.id,
      leftoverInventory: ZERO,
      closedAt: null,
    },
    items,
    warnings,
  };
}
