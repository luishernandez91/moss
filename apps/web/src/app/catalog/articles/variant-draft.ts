import type { AttributeDefinitionForValues, CreateVariant } from '@moss/contracts';
import { parsePesos } from '../../core/format';
import { validateAttributeValues } from './attribute-fields';
import type { VariantDraft } from './variant-fields';

/** Convierte lo capturado en una variante para la API, o devuelve los errores por campo. */
export function readVariantDraft(
  definitions: readonly AttributeDefinitionForValues[],
  draft: VariantDraft,
):
  | { variant: CreateVariant; errors: null }
  | { variant: null; errors: Record<string, string>; attributeErrors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (draft.sku.trim() === '') errors['sku'] = 'Escribe el SKU.';
  const averageCost = parsePesos(draft.averageCost);
  if (averageCost === null || averageCost < 0)
    errors['averageCost'] = 'Escribe un costo como 15.50.';
  const price = draft.price.trim() === '' ? null : parsePesos(draft.price);
  if (price !== null && price < 0) errors['price'] = 'El precio no puede ser negativo.';
  if (draft.price.trim() !== '' && price === null)
    errors['price'] = 'Escribe un precio como 35.00.';
  const stock = Number(draft.stock);
  if (draft.stock.trim() === '' || !Number.isFinite(stock) || stock < 0) {
    errors['stock'] = 'Escribe una existencia de 0 o más.';
  }
  const attributes = validateAttributeValues(definitions, 'variant', draft.attributes);
  if (Object.keys(errors).length > 0 || attributes.values === null) {
    return { variant: null, errors, attributeErrors: attributes.errors };
  }
  return {
    variant: {
      sku: draft.sku,
      attributes: attributes.values,
      averageCost: averageCost!,
      price,
      stock,
    },
    errors: null,
  };
}
