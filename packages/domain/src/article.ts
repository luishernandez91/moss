/**
 * Artículos y variantes: especificación §2 («Artículos»), §4 pantallas 4 y 5, y §9
 * (`articulos`, `articulo_variantes`). Reglas puras; los valores de atributo se validan con el
 * esquema que `packages/contracts` construye a partir de las definiciones de C1.
 */
import type { AttributeValue } from './cost-resolution.js';

/** Unidad en la que se expresan la existencia y el costo promedio de todas las variantes. */
export const STOCK_UNITS = ['piece', 'm', 'kg', 'l', 'bag'] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];

export const stockUnitLabels: Readonly<Record<StockUnit, string>> = {
  piece: 'pieza',
  m: 'm',
  kg: 'kg',
  l: 'l',
  bag: 'bulto',
};

export const ARTICLE_NAME_MAX = 120;
export const SKU_MAX = 40;
/** `numeric(12,3)`: nueve dígitos enteros y tres decimales. */
export const STOCK_MAX = 999_999_999.999;

export type AttributeValues = Readonly<Record<string, AttributeValue>>;

export interface ExistingVariant {
  sizeId?: string | null;
  id: string;
  sku: string;
  attributes: AttributeValues;
  active: boolean;
}

export type ArticleErrorCode =
  'INVALID_SKU' | 'DUPLICATE_SKU' | 'DUPLICATE_COMBINATION' | 'INVALID_FLAGS' | 'INVALID_STOCK';

export class ArticleError extends Error {
  override name = 'ArticleError';
  constructor(
    readonly code: ArticleErrorCode,
    message: string,
    /** Variante existente con la que choca, para ofrecer «Reactivar» si está inactiva. */
    readonly conflict?: { variantId: string; active: boolean },
  ) {
    super(message);
  }
}

const SKU_PATTERN = new RegExp(`^[A-Z0-9][A-Z0-9-]{0,${SKU_MAX - 1}}$`);

/** SKU recortado en mayúsculas: letras sin acento, dígitos y guiones, hasta 40 caracteres. */
export function normalizeSku(sku: string): string {
  const normalized = sku.trim().toUpperCase();
  if (!SKU_PATTERN.test(normalized)) {
    throw new ArticleError(
      'INVALID_SKU',
      `El SKU debe empezar con letra o número y usar solo letras, números y guiones (máximo ${SKU_MAX}).`,
    );
  }
  return normalized;
}

/** §2: un artículo «se vende solo», «se usa en recetas» o ambas. */
export function assertArticleFlags(flags: { sold: boolean; usedInRecipes: boolean }): void {
  if (!flags.sold && !flags.usedInRecipes) {
    throw new ArticleError('INVALID_FLAGS', 'Un artículo se vende, se usa en recetas o ambas.');
  }
}

/** Existencia no negativa con hasta tres decimales (el consumo es fraccionario, §2). */
export function validateStock(stock: number): number {
  if (
    !Number.isFinite(stock) ||
    stock < 0 ||
    stock > STOCK_MAX ||
    Math.round(stock * 1000) / 1000 !== stock
  ) {
    throw new ArticleError(
      'INVALID_STOCK',
      'La existencia debe ser un número no negativo con hasta 3 decimales.',
    );
  }
  return stock;
}

/** Clave canónica de una combinación: claves ordenadas y valores con su tipo. */
export function combinationKey(attributes: AttributeValues, sizeId: string | null = null): string {
  const sorted = Object.keys(attributes)
    .sort()
    .map((key) => [key, attributes[key]] as const);
  return JSON.stringify([sizeId, Object.fromEntries(sorted)]);
}

/**
 * Variante del mismo artículo con la misma combinación, activa o no. `excludeId` omite la variante
 * que se edita. Sin tamaño ni atributos de variante se admite una sola variante `{}`; con tamaño, una por tamaño.
 */
export function findDuplicateCombination(
  attributes: AttributeValues,
  variants: readonly ExistingVariant[],
  excludeId?: string,
  sizeId: string | null = null,
): ExistingVariant | undefined {
  const key = combinationKey(attributes, sizeId);
  return variants.find(
    (variant) =>
      variant.id !== excludeId &&
      combinationKey(variant.attributes, variant.sizeId ?? null) === key,
  );
}

/** Error claro para una combinación repetida; si la existente está inactiva, se ofrece reactivar. */
export function duplicateCombinationError(existing: ExistingVariant): ArticleError {
  const suffix = existing.active ? '' : ' Está desactivada: reactívala en lugar de crearla.';
  return new ArticleError(
    'DUPLICATE_COMBINATION',
    `La variante ${existing.sku} ya tiene esa combinación de atributos.${suffix}`,
    { variantId: existing.id, active: existing.active },
  );
}

/** Error claro para un SKU repetido en el catálogo, activo o no. */
export function duplicateSkuError(existing: ExistingVariant): ArticleError {
  const suffix = existing.active ? '' : ' Está desactivada: reactívala en lugar de crearla.';
  return new ArticleError('DUPLICATE_SKU', `El SKU ${existing.sku} ya existe.${suffix}`, {
    variantId: existing.id,
    active: existing.active,
  });
}
