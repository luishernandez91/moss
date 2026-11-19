/**
 * Resolución del precio de una pieza en una venta (especificación §2 y §8, regla 5).
 * Función pura: el reloj y la lista de precios se inyectan.
 */
import { today, type BusinessDate, type Clock } from './business-date.js';
import { isCampaignOpen, type CampaignSchedule } from './campaign-status.js';
import type { SizeId } from './cost-resolution.js';
import { add, cents, marginPercent, type Cents } from './money.js';

/** Origen del precio aplicado. Mismos valores en la base; `manual`, `campana`, `lista`, `general` en la especificación (§9). */
export type PriceSource = 'manual' | 'campaign' | 'list' | 'general';

export type { PersistedCampaignStatus } from './campaign-status.js';

export type MarginWarning = 'below_cost' | 'below_min_margin';

export type IgnoredSpecialPrice = 'campaign_not_open' | 'requires_review';

export type PricedItem =
  { kind: 'product'; productId: string; size: SizeId } | { kind: 'variant'; variantSku: string };

export interface PriceListQuery {
  item: PricedItem;
  quantity: number;
  date: BusinessDate;
  channel?: string;
}

/** Lista de precios por canal o cantidad (fase 2). Devuelve null si la lista no tiene precio. */
export type PriceListLookup = (query: PriceListQuery) => Cents | null;

/** Campaña de la venta; su estado se deriva con `deriveCampaignStatus` (D4). */
export type PricingCampaign = CampaignSchedule;

export interface ResolvePriceInput {
  item: PricedItem;
  /** Piezas de la partida; entero positivo. Solo se usa para consultar la lista. */
  quantity: number;
  channel?: string;
  /** Costo unitario de la pieza (D2 o snapshot), con el extra incluido. */
  unitCost: Cents;
  /** Precio del producto para el tamaño, o de la variante. No se hereda del padre. */
  generalPrice: Cents | null;
  /** Extra elegido y su precio; se suma a los precios general, de lista y especial. */
  addOn?: { id: string; price: Cents };
  campaign: PricingCampaign;
  /** Precio especial del item de campaña. */
  specialPrice?: { price: Cents; requiresReview: boolean } | null;
  priceList?: PriceListLookup;
  /** Ajuste manual: precio total de la pieza, extra incluido. */
  manual?: { price: Cents; reason: string };
  /** Margen mínimo configurado para el aviso, en porcentaje (0 ≤ x < 100). */
  minMarginPercent: number;
  /**
   * Fecha de la venta, para la vigencia de la lista de precios. Por defecto, hoy.
   * La ventana del precio especial siempre usa hoy, porque el estado de la campaña es el actual.
   */
  saleDate?: BusinessDate;
  clock: Clock;
}

export interface MarginEvaluation {
  /** Margen sobre el precio (0–100); null si el precio es 0. */
  marginPercent: number | null;
  warning: MarginWarning | null;
}

export interface PriceResolution extends MarginEvaluation {
  /** Precio de lista o general, con extra; es el `precio_lista` del snapshot. */
  listPrice: Cents | null;
  appliedPrice: Cents;
  source: PriceSource;
  unitCost: Cents;
  /** Por qué no se usó un precio especial que existía; null si se usó, no había o ganó el manual. */
  ignoredSpecialPrice: IgnoredSpecialPrice | null;
}

export type PriceResolutionErrorCode =
  | 'NO_PRICE'
  | 'MANUAL_REASON_REQUIRED'
  | 'INVALID_AMOUNT'
  | 'NEGATIVE_AMOUNT'
  | 'INVALID_MIN_MARGIN'
  | 'INVALID_QUANTITY'
  | 'ADDON_NOT_ALLOWED';

export class PriceResolutionError extends Error {
  override name = 'PriceResolutionError';
  constructor(
    readonly code: PriceResolutionErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function assertAmount(amount: Cents, label: string): Cents {
  if (!Number.isSafeInteger(amount)) {
    throw new PriceResolutionError(
      'INVALID_AMOUNT',
      `El ${label} debe ser un entero de centavos; se recibió ${amount}.`,
    );
  }
  if (amount < 0) {
    throw new PriceResolutionError('NEGATIVE_AMOUNT', `El ${label} no puede ser negativo.`);
  }
  return cents(amount);
}

function assertMinMargin(minMarginPercent: number): void {
  if (!Number.isFinite(minMarginPercent) || minMarginPercent < 0 || minMarginPercent >= 100) {
    throw new PriceResolutionError(
      'INVALID_MIN_MARGIN',
      `El margen mínimo debe estar entre 0% y menos de 100%; se recibió ${minMarginPercent}.`,
    );
  }
}

/**
 * Margen de un precio sobre su costo y aviso si queda bajo el costo o bajo el margen mínimo.
 * El aviso se decide sin dividir. Con un mínimo decimal (11.3%), el producto
 * `mínimo × precio` se corrige a 12 cifras, como en `money.ts`, para que un margen
 * exactamente igual al mínimo no avise por error de representación binaria.
 */
export function evaluateMargin(
  cost: Cents,
  price: Cents,
  minMarginPercent: number,
): MarginEvaluation {
  assertAmount(cost, 'costo');
  assertAmount(price, 'precio');
  assertMinMargin(minMarginPercent);
  let warning: MarginWarning | null = null;
  if (price < cost) {
    warning = 'below_cost';
  } else if ((price - cost) * 100 < Number((minMarginPercent * price).toPrecision(12))) {
    warning = 'below_min_margin';
  }
  return { marginPercent: marginPercent(cost, price), warning };
}

/**
 * Orden: ajuste manual > precio especial de campaña (activa o por cerrar, sin revisión
 * pendiente) > lista de precios > precio general. El extra se suma salvo en el manual.
 */
export function resolvePrice(input: ResolvePriceInput): PriceResolution {
  const { item, quantity, channel, campaign, specialPrice, priceList, manual } = input;

  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new PriceResolutionError(
      'INVALID_QUANTITY',
      `La cantidad debe ser un entero mayor que cero; se recibió ${quantity}.`,
    );
  }
  assertMinMargin(input.minMarginPercent);
  const unitCost = assertAmount(input.unitCost, 'costo');
  const generalPrice =
    input.generalPrice === null ? null : assertAmount(input.generalPrice, 'precio general');
  if (input.addOn && item.kind === 'variant') {
    throw new PriceResolutionError(
      'ADDON_NOT_ALLOWED',
      `El extra «${input.addOn.id}» solo se aplica a productos, no a una variante vendida sola.`,
    );
  }
  const addOnPrice = input.addOn ? assertAmount(input.addOn.price, 'precio del extra') : cents(0);
  const special = specialPrice ? assertAmount(specialPrice.price, 'precio especial') : null;
  if (manual) {
    assertAmount(manual.price, 'precio manual');
    if (manual.reason.trim() === '') {
      throw new PriceResolutionError(
        'MANUAL_REASON_REQUIRED',
        'El ajuste manual del precio necesita un motivo.',
      );
    }
  }

  const date = today(input.clock);
  const fromList = priceList?.({
    item,
    quantity,
    date: input.saleDate ?? date,
    ...(channel !== undefined && { channel }),
  });
  const listBase =
    fromList === undefined || fromList === null ? null : assertAmount(fromList, 'precio de lista');
  const listPrice =
    listBase !== null
      ? add(listBase, addOnPrice)
      : generalPrice !== null
        ? add(generalPrice, addOnPrice)
        : null;

  let ignoredSpecialPrice: IgnoredSpecialPrice | null = null;
  let specialApplies = false;
  if (special !== null && !manual) {
    if (!isCampaignOpen(campaign, input.clock)) {
      ignoredSpecialPrice = 'campaign_not_open';
    } else if (specialPrice!.requiresReview) {
      ignoredSpecialPrice = 'requires_review';
    } else {
      specialApplies = true;
    }
  }

  let appliedPrice: Cents;
  let source: PriceSource;
  if (manual) {
    appliedPrice = manual.price;
    source = 'manual';
  } else if (specialApplies) {
    appliedPrice = add(special!, addOnPrice);
    source = 'campaign';
  } else if (listBase !== null) {
    appliedPrice = listPrice!;
    source = 'list';
  } else if (listPrice !== null) {
    appliedPrice = listPrice;
    source = 'general';
  } else {
    throw new PriceResolutionError(
      'NO_PRICE',
      'La pieza no tiene precio general, de lista ni especial de campaña vigente; ajusta el precio manualmente con motivo.',
    );
  }

  return {
    listPrice,
    appliedPrice,
    source,
    unitCost,
    ...evaluateMargin(unitCost, appliedPrice, input.minMarginPercent),
    ignoredSpecialPrice,
  };
}
