/**
 * Dinero en centavos enteros. Nunca se usan flotantes para montos.
 * Ver AGENTS.md, regla de dominio 1.
 */
export type Cents = number & { readonly __brand: 'Cents' };

export class MoneyError extends Error {
  override name = 'MoneyError';
}

function assertInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} debe ser un entero de centavos; se recibió ${value}`);
  }
}

/** Crea un monto a partir de centavos enteros. */
export function cents(value: number): Cents {
  assertInteger(value, 'El monto');
  return value as Cents;
}

/** Convierte pesos escritos como texto ("1540.50", "110") a centavos sin pasar por flotantes. */
export function fromPesos(pesos: string): Cents {
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(pesos.trim());
  if (!match) {
    throw new MoneyError(`Monto inválido: "${pesos}"`);
  }
  const [, sign, whole = '0', fraction = ''] = match;
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return cents(sign ? -value : value);
}

export const ZERO = cents(0);

export function add(...amounts: Cents[]): Cents {
  return cents(amounts.reduce<number>((total, amount) => total + amount, 0));
}

export function subtract(a: Cents, b: Cents): Cents {
  return cents(a - b);
}

export function negate(a: Cents): Cents {
  return cents(-a);
}

/**
 * Redondeo half-up simétrico (0.5 se aleja de cero) sobre un número de centavos.
 * Se corrige el error de representación binaria antes de redondear.
 */
function roundHalfUp(value: number): number {
  const corrected = Number(value.toPrecision(12));
  return Math.sign(corrected) * Math.round(Math.abs(corrected));
}

/**
 * Multiplica un precio unitario por una cantidad que puede ser decimal
 * (ej. 0.01 de bulto, 4 metros) y redondea una sola vez a centavos.
 */
export function multiply(unitPrice: Cents, quantity: number): Cents {
  if (!Number.isFinite(quantity)) {
    throw new MoneyError(`Cantidad inválida: ${quantity}`);
  }
  return cents(roundHalfUp(unitPrice * quantity));
}

/** Porcentaje de un monto, ej. percentage(ganancia, 30) para la reinversión. */
export function percentage(amount: Cents, percent: number): Cents {
  return multiply(amount, percent / 100);
}

/**
 * Divide un monto en partes según pesos (ej. [50, 50]) sin perder centavos.
 * El residuo se asigna en orden a las primeras partes, de forma determinista.
 */
export function allocate(amount: Cents, weights: readonly number[]): Cents[] {
  if (weights.length === 0) {
    throw new MoneyError('Se necesita al menos una parte para repartir');
  }
  if (weights.some((weight) => weight < 0 || !Number.isFinite(weight))) {
    throw new MoneyError('Los pesos del reparto deben ser números no negativos');
  }
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight === 0) {
    throw new MoneyError('La suma de los pesos del reparto no puede ser cero');
  }
  const sign = amount < 0 ? -1 : 1;
  const absolute = Math.abs(amount);
  const shares = weights.map((weight) => Math.floor((absolute * weight) / totalWeight));
  let remainder = absolute - shares.reduce((sum, share) => sum + share, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % shares.length) {
    if (weights[index]! > 0) {
      shares[index] = shares[index]! + 1;
      remainder -= 1;
    }
  }
  return shares.map((share) => cents(sign * share));
}

/** Margen sobre el precio de venta, en porcentaje (0–100). Null si el precio es 0. */
export function marginPercent(cost: Cents, price: Cents): number | null {
  if (price === 0) {
    return null;
  }
  return ((price - cost) / price) * 100;
}
