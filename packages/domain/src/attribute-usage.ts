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

/** Si el atributo está activo antes y después del cambio; solo un atributo activo exige valor. */
export interface AttributeActivity {
  before: boolean;
  after: boolean;
}

/**
 * Valida la definición resultante (`next`, ya normalizada por C1) contra los valores guardados.
 * Renombrar el atributo, agregar opciones y desactivarlo siempre son compatibles. Reactivar un
 * atributo requerido exige que no falten valores, igual que marcarlo como requerido.
 */
export function assessAttributeChange(
  current: AttributeDefinition,
  next: AttributeDefinition,
  usage: AttributeUsage,
  activity: AttributeActivity = { before: true, after: true },
): void {
  const wasRequired = activity.before && current.required;
  const isRequired = activity.after && next.required;
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
    // Sin valores, el atributo cambia de alcance y todos los registros del nuevo alcance carecen de él.
    if (isRequired && next.definesVariant && usage.typeVariantCount > 0) {
      throw new AttributeUsageError(
        'ATTRIBUTE_VALUES_MISSING',
        `«${current.name}» pasaría a definir variante y faltaría su valor en ${plural(usage.typeVariantCount, 'variante', 'variantes')}.`,
      );
    }
    if (isRequired && !next.definesVariant && usage.typeArticleCount > 0) {
      throw new AttributeUsageError(
        'ATTRIBUTE_VALUES_MISSING',
        `«${current.name}» dejaría de definir variante y faltaría su valor en ${plural(usage.typeArticleCount, 'artículo', 'artículos')}.`,
      );
    }
  }
  if (current.options && next.options) {
    // Comparación exacta: los valores guardados y el esquema de contracts distinguen mayúsculas.
    const removed = current.options.filter((option) => !next.options!.includes(option));
    const inUse = removed.filter((option) => usage.optionsInUse.includes(option));
    if (inUse.length > 0) {
      throw new AttributeUsageError(
        'ATTRIBUTE_IN_USE',
        `No se pueden quitar ni renombrar opciones con valores guardados: ${inUse.join(', ')}.`,
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
    isRequired &&
    !wasRequired &&
    next.definesVariant === current.definesVariant &&
    usage.missingCount > 0
  ) {
    const action = activity.before ? 'marcarlo como requerido' : 'reactivarlo';
    throw new AttributeUsageError(
      'ATTRIBUTE_VALUES_MISSING',
      `«${current.name}» no tiene valor en ${plural(usage.missingCount, 'registro', 'registros')}; llénalos antes de ${action}.`,
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
