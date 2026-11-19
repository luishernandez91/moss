/**
 * Tipos de artículo y definición de atributos: especificación §2 («Artículos»), §4 pantalla 3 y §9
 * (`tipos_articulo`, `atributos`). Solo definiciones; los valores (JSONB) se validan en C2.
 */

export const ATTRIBUTE_DATA_TYPES = ['text', 'number', 'list', 'boolean'] as const;
export type AttributeDataType = (typeof ATTRIBUTE_DATA_TYPES)[number];

/** Etiquetas visibles en la interfaz. */
export const attributeDataTypeLabels: Readonly<Record<AttributeDataType, string>> = {
  text: 'Texto',
  number: 'Número',
  list: 'Lista',
  boolean: 'Sí/No',
};

export const ARTICLE_TYPE_NAME_MAX = 60;
export const ATTRIBUTE_NAME_MAX = 60;
export const ATTRIBUTE_UNIT_MAX = 20;
export const ATTRIBUTE_OPTION_MAX = 60;

export interface ExistingArticleType {
  id: string;
  name: string;
}

export interface ExistingAttribute {
  id: string;
  key: string;
  name: string;
}

export interface AttributeDefinitionInput {
  name: string;
  dataType: AttributeDataType;
  unit?: string | null;
  options?: readonly string[] | null;
  required: boolean;
  definesVariant: boolean;
}

/** Cambios permitidos: el tipo de dato y la clave no cambian después de crear el atributo. */
export type AttributeDefinitionPatch = Partial<
  Pick<AttributeDefinitionInput, 'name' | 'unit' | 'options' | 'required' | 'definesVariant'>
> & {
  /** Solo se acepta si es igual a la actual: la clave es inmutable. */
  key?: string;
};

export interface AttributeDefinition {
  /** Clave de los valores en JSONB; se genera del nombre al crear y no cambia. */
  key: string;
  name: string;
  dataType: AttributeDataType;
  unit: string | null;
  options: string[] | null;
  required: boolean;
  definesVariant: boolean;
}

export type ArticleTypeErrorCode =
  | 'INVALID_NAME'
  | 'DUPLICATE_NAME'
  | 'KEY_CONFLICT'
  | 'INVALID_UNIT'
  | 'INVALID_OPTIONS'
  | 'VARIANT_REQUIRES_REQUIRED'
  | 'KEY_IMMUTABLE';

export class ArticleTypeError extends Error {
  override name = 'ArticleTypeError';
  constructor(
    readonly code: ArticleTypeErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Clave estable para un nombre: sin acentos, minúsculas y `_` en lugar de cualquier separador
 * («Tóxica mascotas» → `toxica_mascotas`). Vacía si el nombre no tiene letras ni números.
 */
export function attributeKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Recorta y colapsa espacios internos. */
function clean(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function sameText(a: string, b: string): boolean {
  return clean(a).toLowerCase() === clean(b).toLowerCase();
}

function assertName(name: string, max: number, label: string): string {
  const cleaned = clean(name);
  if (cleaned === '' || cleaned.length > max || attributeKey(cleaned) === '') {
    throw new ArticleTypeError(
      'INVALID_NAME',
      `${label} debe tener entre 1 y ${max} caracteres, con al menos una letra o número.`,
    );
  }
  return cleaned;
}

/** Nombre del tipo, único sin distinguir mayúsculas, acentos ni espacios. */
export function validateArticleTypeName(
  name: string,
  existing: readonly ExistingArticleType[],
  currentId?: string,
): string {
  const cleaned = assertName(name, ARTICLE_TYPE_NAME_MAX, 'El nombre del tipo');
  const key = attributeKey(cleaned);
  const duplicate = existing.find(
    (type) => type.id !== currentId && attributeKey(type.name) === key,
  );
  if (duplicate) {
    throw new ArticleTypeError(
      'DUPLICATE_NAME',
      `Ya existe el tipo de artículo «${duplicate.name}».`,
    );
  }
  return cleaned;
}

function assertUniqueName(name: string, siblings: readonly ExistingAttribute[]): void {
  const duplicate = siblings.find((attribute) => sameText(attribute.name, name));
  if (duplicate) {
    throw new ArticleTypeError(
      'DUPLICATE_NAME',
      `Ya existe el atributo «${duplicate.name}» en este tipo.`,
    );
  }
  const key = attributeKey(name);
  const conflict = siblings.find(
    (attribute) => attribute.key === key || attributeKey(attribute.name) === key,
  );
  if (conflict) {
    throw new ArticleTypeError(
      'KEY_CONFLICT',
      `«${name}» genera la clave «${key}», que ya usa el atributo «${conflict.name}».`,
    );
  }
}

function normalizeUnit(
  dataType: AttributeDataType,
  unit: string | null | undefined,
): string | null {
  const cleaned = unit == null ? '' : clean(unit);
  if (cleaned === '') return null;
  if (dataType !== 'number') {
    throw new ArticleTypeError('INVALID_UNIT', 'Solo los atributos de tipo número llevan unidad.');
  }
  if (cleaned.length > ATTRIBUTE_UNIT_MAX) {
    throw new ArticleTypeError(
      'INVALID_UNIT',
      `La unidad debe tener como máximo ${ATTRIBUTE_UNIT_MAX} caracteres.`,
    );
  }
  return cleaned;
}

function normalizeOptions(
  dataType: AttributeDataType,
  options: readonly string[] | null | undefined,
): string[] | null {
  if (dataType !== 'list') {
    if (options != null && options.length > 0) {
      throw new ArticleTypeError(
        'INVALID_OPTIONS',
        'Solo los atributos de tipo lista llevan opciones.',
      );
    }
    return null;
  }
  if (options == null || options.length === 0) {
    throw new ArticleTypeError('INVALID_OPTIONS', 'Una lista necesita al menos una opción.');
  }
  const cleaned: string[] = [];
  for (const option of options) {
    const value = clean(option);
    if (value === '' || value.length > ATTRIBUTE_OPTION_MAX) {
      throw new ArticleTypeError(
        'INVALID_OPTIONS',
        `Cada opción debe tener entre 1 y ${ATTRIBUTE_OPTION_MAX} caracteres.`,
      );
    }
    if (cleaned.some((existing) => sameText(existing, value))) {
      throw new ArticleTypeError(
        'INVALID_OPTIONS',
        `La opción «${value.toLowerCase()}» está repetida.`,
      );
    }
    cleaned.push(value);
  }
  return cleaned;
}

/**
 * Completa las marcas para cumplir «define variante ⇒ requerido»: marcar variante marca requerido.
 * La interfaz lo usa al editar; `assertVariantRule` rechaza la combinación inválida.
 */
export function applyVariantRule(flags: { required: boolean; definesVariant: boolean }): {
  required: boolean;
  definesVariant: boolean;
} {
  return { required: flags.required || flags.definesVariant, definesVariant: flags.definesVariant };
}

function assertVariantRule(required: boolean, definesVariant: boolean): void {
  if (definesVariant && !required) {
    throw new ArticleTypeError(
      'VARIANT_REQUIRES_REQUIRED',
      'Un atributo que define variante debe ser requerido.',
    );
  }
}

/**
 * Valida un atributo nuevo contra los demás atributos del mismo tipo y genera su clave.
 * `siblings` no incluye al atributo que se crea.
 */
export function createAttributeDefinition(
  input: AttributeDefinitionInput,
  siblings: readonly ExistingAttribute[],
): AttributeDefinition {
  const name = assertName(input.name, ATTRIBUTE_NAME_MAX, 'El nombre del atributo');
  assertUniqueName(name, siblings);
  const unit = normalizeUnit(input.dataType, input.unit);
  const options = normalizeOptions(input.dataType, input.options);
  assertVariantRule(input.required, input.definesVariant);
  return {
    key: attributeKey(name),
    name,
    dataType: input.dataType,
    unit,
    options,
    required: input.required,
    definesVariant: input.definesVariant,
  };
}

/**
 * Aplica cambios parciales y valida la definición resultante. La clave y el tipo de dato se
 * conservan. `siblings` no incluye al atributo que se edita.
 */
export function updateAttributeDefinition(
  current: AttributeDefinition,
  patch: AttributeDefinitionPatch,
  siblings: readonly ExistingAttribute[],
): AttributeDefinition {
  if (patch.key !== undefined && patch.key !== current.key) {
    throw new ArticleTypeError(
      'KEY_IMMUTABLE',
      `La clave «${current.key}» no cambia; renombra el atributo para cambiar solo su etiqueta.`,
    );
  }
  const name =
    patch.name === undefined
      ? current.name
      : assertName(patch.name, ATTRIBUTE_NAME_MAX, 'El nombre del atributo');
  if (patch.name !== undefined) assertUniqueName(name, siblings);
  const unit = normalizeUnit(
    current.dataType,
    patch.unit === undefined ? current.unit : patch.unit,
  );
  const options = normalizeOptions(
    current.dataType,
    patch.options === undefined ? current.options : patch.options,
  );
  const definesVariant = patch.definesVariant ?? current.definesVariant;
  // Marcar «define variante» sin indicar «requerido» lo vuelve requerido; un «false» explícito falla.
  const required =
    patch.required ?? applyVariantRule({ required: current.required, definesVariant }).required;
  assertVariantRule(required, definesVariant);
  return {
    key: current.key,
    name,
    dataType: current.dataType,
    unit,
    options,
    required,
    definesVariant,
  };
}
