/** Configuración de socios: pantalla 22. D7 conserva su contrato de puntos base genéricos. */
export const PARTNER_NAME_MAX = 100;
export const DEFAULT_PARTNER_SHARE_BPS = 5000;
export const PARTNER_COUNT = 2;
export interface PartnerSettings {
  id: string;
  name: string;
  shareBps: number;
}
export class PartnerError extends Error {
  override name = 'PartnerError';
  constructor(
    readonly code: 'INVALID_PARTNERS' | 'INVALID_SHARES' | 'INVALID_NAME' | 'PARTNER_LIMIT',
    message: string,
  ) {
    super(message);
  }
}
export function percentageToShareBps(percentage: number): number {
  if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
    throw new PartnerError('INVALID_SHARES', 'Usa porcentajes enteros entre 0 y 100.');
  }
  return percentage * 100;
}
export function validatePartnerSettings(input: readonly PartnerSettings[]): PartnerSettings[] {
  if (
    input.length !== PARTNER_COUNT ||
    input.some((p) => !p.id.trim()) ||
    new Set(input.map((p) => p.id)).size !== PARTNER_COUNT
  ) {
    throw new PartnerError(
      'INVALID_PARTNERS',
      'Se requieren exactamente dos socios con identificadores distintos.',
    );
  }
  const result = input.map((p) => {
    percentageToShareBps(p.shareBps / 100);
    const name = p.name.trim();
    if (!name || name.length > PARTNER_NAME_MAX)
      throw new PartnerError('INVALID_NAME', 'El nombre debe tener entre 1 y 100 caracteres.');
    return { ...p, name };
  });
  if (result.reduce((sum, p) => sum + p.shareBps, 0) !== 10000)
    throw new PartnerError('INVALID_SHARES', 'Las participaciones deben sumar 100%.');
  return result;
}
export function assertCanCreatePartner(count: number): void {
  if (count >= PARTNER_COUNT)
    throw new PartnerError('PARTNER_LIMIT', 'Solo puede haber dos socios.');
}
