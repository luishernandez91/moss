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
 * Único redondeo a centavos del dominio: numerador / denominador (enteros exactos) con half-up
 * simétrico, es decir, 0.5 se aleja de cero (2.5 → 3, −2.5 → −3). Lo usan `multiply`,
 * `percentageBps`, el prorrateo de D6 y los promedios ponderados futuros (F2.1). Lanza
 * `MoneyError` si el denominador no es positivo o el resultado no es un entero seguro.
 */
export function roundRatioToCents(numerator: bigint, denominator: bigint): Cents {
  if (denominator <= 0n) {
    throw new MoneyError('El denominador del redondeo debe ser positivo');
  }
  const absolute = numerator < 0n ? -numerator : numerator;
  const rounded = (2n * absolute + denominator) / (2n * denominator);
  const result = numerator < 0n ? -rounded : rounded;
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new MoneyError('El resultado del redondeo excede los centavos enteros seguros');
  }
  return cents(Number(result));
}

/** Una cantidad finita como fracción decimal exacta de su representación más corta («0.01», «1e-7»). */
function exactDecimal(quantity: number): { numerator: bigint; denominator: bigint } {
  const match = /^(-)?(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(quantity));
  if (!match) {
    throw new MoneyError(`Cantidad inválida: ${quantity}`);
  }
  const [, sign, whole = '0', fraction = '', exponentText = '0'] = match;
  const exponent = Number(exponentText) - fraction.length;
  let numerator = BigInt(whole + fraction);
  let denominator = 1n;
  if (exponent >= 0) numerator *= 10n ** BigInt(exponent);
  else denominator = 10n ** BigInt(-exponent);
  return { numerator: sign ? -numerator : numerator, denominator };
}

/**
 * Multiplica un precio unitario por una cantidad que puede ser decimal
 * (ej. 0.01 de bulto, 4 metros) y redondea una sola vez a centavos.
 * La cantidad se toma como el decimal que se escribió, no como su aproximación binaria.
 */
export function multiply(unitPrice: Cents, quantity: number): Cents {
  if (!Number.isFinite(quantity)) {
    throw new MoneyError(`Cantidad inválida: ${quantity}`);
  }
  assertInteger(unitPrice, 'El monto');
  const { numerator, denominator } = exactDecimal(quantity);
  return roundRatioToCents(BigInt(unitPrice) * numerator, denominator);
}

/** Porcentaje de un monto, ej. percentage(ganancia, 30) para la reinversión. */
export function percentage(amount: Cents, percent: number): Cents {
  if (!Number.isFinite(percent)) {
    throw new MoneyError(`Porcentaje inválido: ${percent}`);
  }
  assertInteger(amount, 'El monto');
  // Exacto: `percent / 100` en flotante convertiría 0.7 en 0.006999…
  const { numerator, denominator } = exactDecimal(percent);
  return roundRatioToCents(BigInt(amount) * numerator, denominator * 100n);
}

/**
 * Porcentaje en puntos base enteros (10000 = 100%). Producto y redondeo half-up
 * simétrico exactos, incluso cerca del límite de Cents. No convierte bps a flotantes.
 */
export function percentageBps(amount: Cents, bps: number): Cents {
  assertInteger(amount, 'El monto');
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10000) {
    throw new MoneyError('Los puntos base deben ser enteros seguros entre 0 y 10000');
  }
  return roundRatioToCents(BigInt(amount) * BigInt(bps), 10000n);
}

/** Ruta exacta para pesos enteros: bps y montos de trabajo expresados en centavos. */
function allocateIntegers(amount: Cents, weights: readonly number[]): Cents[] {
  const integerWeights = weights.map((weight) => BigInt(weight));
  const totalWeight = integerWeights.reduce((sum, weight) => sum + weight, 0n);
  if (totalWeight === 0n) {
    throw new MoneyError('La suma de los pesos del reparto no puede ser cero');
  }
  const signed = BigInt(amount);
  const absolute = signed < 0n ? -signed : signed;
  const shares = integerWeights.map((weight) => (absolute * weight) / totalWeight);
  let remainder = absolute - shares.reduce((sum, share) => sum + share, 0n);
  for (let index = 0; remainder > 0n; index = (index + 1) % shares.length) {
    if (integerWeights[index]! > 0n) {
      shares[index] = shares[index]! + 1n;
      remainder -= 1n;
    }
  }
  return shares.map((share) => cents(Number(signed < 0n ? -share : share)));
}

/**
 * Divide un monto en partes según pesos (ej. [50, 50]) sin perder centavos.
 * El residuo se asigna en orden a las primeras partes, de forma determinista.
 * Pesos enteros seguros usan aritmética exacta; se conserva el soporte de pesos decimales.
 */
export function allocate(amount: Cents, weights: readonly number[]): Cents[] {
  assertInteger(amount, 'El monto');
  if (weights.length === 0) {
    throw new MoneyError('Se necesita al menos una parte para repartir');
  }
  if (weights.some((weight) => weight < 0 || !Number.isFinite(weight))) {
    throw new MoneyError('Los pesos del reparto deben ser números no negativos');
  }
  if (weights.every((weight) => Number.isSafeInteger(weight))) {
    return allocateIntegers(amount, weights);
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
