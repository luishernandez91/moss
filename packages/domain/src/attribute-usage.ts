/**
 * Cambios a atributos que ya tienen valores guardados (bloqueos pendientes de C1, criterio de C2).
 * La API calcula el uso con consultas `jsonb`; aquí solo se decide si el cambio es compatible.
 */
import type { AttributeDefinition } from './article-type.js';

/**
 * Uso de un atributo. `valueCount` y `missingCount` cuentan registros del alcance actual del
 * atributo: artículos si es fijo, variantes si define variante. Activos o no.
 */
export interface AttributeUsage {
  valueCount: number;
  /** Opciones de lista con al menos un valor guardado. */
  optionsInUse: readonly string[];
  missingCount: number;
  typeArticleCount: number;
  typeVariantCount: number;
}

export type AttributeUsageErrorCode =
  'ATTRIBUTE_IN_USE' | 'ATTRIBUTE_VALUES_MISSING' | 'ARTICLE_TYPE_IN_USE';

/** Conflicto con datos guardados: la API responde 409. */
export class AttributeUsageError extends Error {
  override name = 'AttributeUsageError';
  constructor(
    readonly code: AttributeUsageErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function sameText(a: string, b: string): boolean {
  const clean = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();
  return clean(a) === clean(b);
}

export function assessAttributeDeletion(
  attribute: AttributeDefinition,
  usage: AttributeUsage,
): void {
  if (usage.valueCount > 0) {
    throw new AttributeUsageError(
      'ATTRIBUTE_IN_USE',
      `«${attribute.name}» tiene valores en ${plural(usage.valueCount, 'registro', 'registros')}; desactívalo en lugar de borrarlo.`,
    );
  }
}

/**
 * Valida la definición resultante (`next`, ya normalizada por C1) contra los valores guardados.
 * Renombrar, agregar opciones y activar o desactivar siempre son compatibles.
 */
export function assessAttributeChange(
  current: AttributeDefinition,
  next: AttributeDefinition,
  usage: AttributeUsage,
): void {
  if (next.dataType !== current.dataType) {
    throw new AttributeUsageError('ATTRIBUTE_IN_USE', 'El tipo de dato de un atributo no cambia.');
  }
  if (next.definesVariant !== current.definesVariant) {
    if (usage.valueCount > 0) {
      throw new AttributeUsageError(
        'ATTRIBUTE_IN_USE',
        `No se puede cambiar «define variante» de «${current.name}»: tiene valores en ${plural(usage.valueCount, 'registro', 'registros')}.`,
      );
    }
    if (next.definesVariant && usage.typeVariantCount > 0) {
      throw new AttributeUsageError(
        'ATTRIBUTE_VALUES_MISSING',
        `«${current.name}» pasaría a definir variante y faltaría su valor en ${plural(usage.typeVariantCount, 'variante', 'variantes')}.`,
      );
    }
  }
  if (current.options && next.options) {
    const removed = current.options.filter(
      (option) => !next.options!.some((candidate) => sameText(candidate, option)),
    );
    const inUse = removed.filter((option) =>
      usage.optionsInUse.some((value) => sameText(value, option)),
    );
    if (inUse.length > 0) {
      throw new AttributeUsageError(
        'ATTRIBUTE_IN_USE',
        `No se pueden quitar opciones con valores guardados: ${inUse.join(', ')}.`,
      );
    }
  }
  if (next.unit !== current.unit && usage.valueCount > 0) {
    throw new AttributeUsageError(
      'ATTRIBUTE_IN_USE',
      `No se puede cambiar la unidad de «${current.name}»: cambiaría el significado de ${plural(usage.valueCount, 'valor guardado', 'valores guardados')}.`,
    );
  }
  if (
    next.required &&
    !current.required &&
    next.definesVariant === current.definesVariant &&
    usage.missingCount > 0
  ) {
    throw new AttributeUsageError(
      'ATTRIBUTE_VALUES_MISSING',
      `«${current.name}» no tiene valor en ${plural(usage.missingCount, 'registro', 'registros')}; llénalos antes de marcarlo como requerido.`,
    );
  }
}

/** Un atributo requerido nuevo dejaría sin valor a los artículos o variantes que ya existen. */
export function assessNewAttribute(attribute: AttributeDefinition, usage: AttributeUsage): void {
  if (attribute.definesVariant) {
    if (usage.typeVariantCount > 0) {
      throw new AttributeUsageError(
        'ATTRIBUTE_VALUES_MISSING',
        `«${attribute.name}» definiría variante y faltaría su valor en ${plural(usage.typeVariantCount, 'variante', 'variantes')}.`,
      );
    }
    return;
  }
  if (attribute.required && usage.typeArticleCount > 0) {
    throw new AttributeUsageError(
      'ATTRIBUTE_VALUES_MISSING',
      `«${attribute.name}» sería requerido y faltaría su valor en ${plural(usage.typeArticleCount, 'artículo', 'artículos')}. Créalo opcional, llena los valores y luego márcalo como requerido.`,
    );
  }
}

export function assessTypeDeletion(typeName: string, articleCount: number): void {
  if (articleCount > 0) {
    throw new AttributeUsageError(
      'ARTICLE_TYPE_IN_USE',
      `El tipo «${typeName}» tiene ${plural(articleCount, 'artículo', 'artículos')}; no se puede borrar.`,
    );
  }
}
