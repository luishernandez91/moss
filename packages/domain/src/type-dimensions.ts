/** C6: calcula el estado final sin I/O ni valores predeterminados persistentes. */
import type { AttributeDefinition } from './article-type.js';
import {
  type AttributeValues,
  type ExistingVariant,
  combinationKey,
  duplicateCombinationError,
} from './article.js';
import { assertSizeAssignment, assertSizeRequirement } from './size.js';

export class TypeDimensionError extends Error {
  override name = 'TypeDimensionError';
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export interface DimensionArticle {
  id: string;
  fixedAttributes: AttributeValues;
}
export interface DimensionVariant extends ExistingVariant {
  articleId: string;
  sizeId: string | null;
}
export interface DimensionState {
  articles: readonly DimensionArticle[];
  variants: readonly DimensionVariant[];
}

function assertUnique(variants: readonly DimensionVariant[]): void {
  const seen = new Map<string, DimensionVariant>();
  for (const variant of variants) {
    const key = JSON.stringify([
      variant.articleId,
      combinationKey(variant.attributes, variant.sizeId),
    ]);
    const duplicate = seen.get(key);
    if (duplicate) throw duplicateCombinationError(duplicate);
    seen.set(key, variant);
  }
}

export function planAttributeDimension(
  definition: AttributeDefinition,
  initialValue: unknown,
  state: DimensionState,
): DimensionState {
  const value =
    typeof initialValue === 'string' && definition.dataType === 'text'
      ? initialValue.trim()
      : initialValue;
  const valid =
    definition.dataType === 'text'
      ? typeof value === 'string' && value.length > 0 && value.length <= 200
      : definition.dataType === 'number'
        ? typeof value === 'number' && Number.isFinite(value)
        : definition.dataType === 'boolean'
          ? typeof value === 'boolean'
          : typeof value === 'string' && definition.options?.includes(value);
  if (
    !valid ||
    (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
  ) {
    throw new TypeDimensionError(
      'INVALID_INITIAL_VALUE',
      `Indica un valor inicial válido para «${definition.name}».`,
    );
  }
  const articles = state.articles.map((a) => ({
    ...a,
    fixedAttributes: definition.definesVariant
      ? a.fixedAttributes
      : { ...a.fixedAttributes, [definition.key]: value },
  }));
  const variants = state.variants.map((v) => ({
    ...v,
    attributes: definition.definesVariant
      ? { ...v.attributes, [definition.key]: value }
      : v.attributes,
  }));
  assertUnique(variants);
  return { articles, variants };
}

export function planSizeDimension(
  usesSize: boolean,
  size: { id: string; active: boolean },
  state: DimensionState,
): DimensionState {
  if (usesSize)
    throw new TypeDimensionError(
      'SIZE_ALREADY_ENABLED',
      'Este tipo ya usa tamaño. Recarga los datos.',
    );
  assertSizeAssignment(size, null);
  const variants = state.variants.map((v) => ({ ...v, sizeId: size.id }));
  for (const variant of variants) assertSizeRequirement(true, variant.sizeId);
  assertUnique(variants);
  return { articles: state.articles, variants };
}

/** Un mapa obsoleto no puede borrar una dimensión añadida ni reemplazar una asignación nueva. */
export function assertDimensionSnapshot(
  current: AttributeValues,
  expected: AttributeValues,
  currentSize: string | null = null,
  expectedSize: string | null = null,
): void {
  if (combinationKey(current, currentSize) !== combinationKey(expected, expectedSize)) {
    throw new TypeDimensionError(
      'CATALOG_RECORD_CHANGED',
      'Los atributos o el tamaño cambiaron. Recarga los datos y revisa tu captura antes de guardar.',
    );
  }
}
