/** C3: reglas de tamaños; la API obtiene referencias y persiste en una transacción. */
export const INITIAL_SIZES = [
  { key: 'mini', label: 'Mini' },
  { key: 'small', label: 'Chico' },
  { key: 'medium', label: 'Mediano' },
  { key: 'large', label: 'Grande' },
] as const;

export class SizeError extends Error {
  override name = 'SizeError';
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function assertSizeRequirement(usesSize: boolean, sizeId: string | null): void {
  if (usesSize && sizeId === null) throw new SizeError('SIZE_REQUIRED', 'Elige un tamaño.');
  if (!usesSize && sizeId !== null)
    throw new SizeError('SIZE_NOT_ALLOWED', 'Este tipo de artículo no usa tamaño.');
}

export function assertUsesSizeChange(before: boolean, after: boolean, articleCount: number): void {
  if (before !== after && articleCount > 0)
    throw new SizeError(
      'ARTICLE_TYPE_IN_USE',
      'El tipo ya tiene artículos; no se puede cambiar «Usa tamaño».',
    );
}

export function assertSizeDeletion(referenceCount: number): void {
  if (referenceCount > 0)
    throw new SizeError(
      'SIZE_IN_USE',
      'El tamaño está en uso; puedes desactivarlo, pero no borrarlo.',
    );
}

export function assertSizeAssignment(
  size: { id: string; active: boolean },
  currentId: string | null,
): void {
  if (!size.active && size.id !== currentId)
    throw new SizeError('SIZE_INACTIVE', 'El tamaño está desactivado; elige uno activo.');
}

interface SizeDefinition {
  key: string;
  label: string;
  active: boolean;
}
export function validateSize(
  input: SizeDefinition,
  existing: readonly (SizeDefinition & { id: string })[],
  current?: SizeDefinition & { id: string },
): SizeDefinition {
  if (current && input.key !== current.key)
    throw new SizeError('KEY_IMMUTABLE', 'La clave del tamaño no se puede cambiar.');
  if (!/^[a-z][a-z0-9_]{0,39}$/.test(input.key))
    throw new SizeError(
      'INVALID_SIZE_KEY',
      'Usa una clave en inglés con letras minúsculas, números o guion bajo.',
    );
  if (existing.some((s) => s.id !== current?.id && s.key === input.key))
    throw new SizeError('DUPLICATE_SIZE_KEY', 'Ya existe un tamaño con esa clave.');
  const label = input.label.trim();
  if (!label || label.length > 80)
    throw new SizeError('INVALID_SIZE_LABEL', 'Escribe un nombre de hasta 80 caracteres.');
  return { key: input.key, label, active: input.active };
}

export function validateSizeOrder(ids: readonly string[], currentIds: readonly string[]): void {
  if (
    ids.length !== currentIds.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !currentIds.includes(id))
  ) {
    throw new SizeError(
      'SIZE_ORDER_CONFLICT',
      'Cambió el catálogo de tamaños. Recarga antes de ordenar.',
    );
  }
}
