/**
 * Prorrateo de costos fijos por unidad producida: especificación §1 («se prorratean por unidad»),
 * §5 pantalla 13 («prorrateo por unidad producida») y §8 regla 1.
 *
 * Sin doble conteo: este cálculo solo sirve para precio y para comparar costo de receta contra
 * costo real. El resultado de la campaña y el reparto salen de `calculateProfitSplit` (D7), que ya
 * recibe todos los gastos reales, fijos incluidos. Nada de lo que devuelve esta función debe
 * sumarse al resultado ni pasarse al cierre: solo redistribuye por pieza un gasto que ya existe
 * (Σ allocated + unallocated = fixedCosts).
 */
import { add, allocate, cents, roundRatioToCents, ZERO, type Cents } from './money.js';

export interface FixedCostLine {
  /** Clave de la línea de costeo (ej. producto + tamaño); la define quien llama. */
  id: string;
  /** Unidades producidas en la campaña: entero seguro ≥ 0. */
  unitsProduced: number;
  /** Suma de los costos unitarios guardados en las producciones (snapshots) de la línea. */
  recipeCost: Cents;
}

export interface FixedCostAllocationInput {
  /** Total de gastos fijos de la campaña (plaza, gasolina, publicidad); lo suma quien llama. */
  fixedCosts: Cents;
  lines: readonly FixedCostLine[];
}

export interface FixedCostLineAllocation {
  id: string;
  unitsProduced: number;
  /** Parte exacta de los costos fijos que corresponde a la línea. */
  allocated: Cents;
  /**
   * Reparto exacto por pieza con pesos iguales: `unitsWithExtraCent` piezas llevan `base + 1¢`
   * y el resto `base`. Null si no hay unidades.
   */
  perUnit: { base: Cents; unitsWithExtraCent: number } | null;
  /** Informativo: allocated / unidades con redondeo half-up. */
  fixedPerUnit: Cents | null;
  /** Informativo: recipeCost / unidades con redondeo half-up. */
  recipeUnitCost: Cents | null;
  /** Informativo: (recipeCost + allocated) / unidades, redondeado una sola vez half-up. */
  realUnitCost: Cents | null;
}

export interface FixedCostAllocation {
  /** Orden ascendente de ID, por comparación de cadenas UTF-16 sin depender del idioma. */
  lines: readonly FixedCostLineAllocation[];
  /** Costos fijos sin base de prorrateo (ninguna unidad producida). */
  unallocated: Cents;
}

export type FixedCostAllocationErrorCode =
  | 'INVALID_LINES'
  | 'INVALID_UNITS'
  | 'INVALID_AMOUNT'
  | 'NEGATIVE_AMOUNT'
  | 'INCONSISTENT_RECIPE_COST'
  | 'UNBALANCED_ALLOCATION';

export class FixedCostAllocationError extends Error {
  override name = 'FixedCostAllocationError';
  constructor(
    readonly code: FixedCostAllocationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function assertAmount(amount: Cents, label: string): void {
  if (!Number.isSafeInteger(amount)) {
    throw new FixedCostAllocationError(
      'INVALID_AMOUNT',
      `${label} debe ser un entero seguro de centavos.`,
    );
  }
  if (amount < 0) {
    throw new FixedCostAllocationError('NEGATIVE_AMOUNT', `${label} no puede ser negativo.`);
  }
}

/**
 * Reparte los costos fijos entre las líneas con peso = unidades producidas (por unidad puro, sin
 * pesos adicionales). El residuo entre líneas va por ID ascendente UTF-16 al primer peso positivo
 * (misma regla que D7); dentro de cada línea se reparte con pesos iguales, así que ninguna pieza
 * difiere de otra en más de 1¢. Las cifras por pieza son informativas: el monto exacto es
 * `allocated`. No modifica entradas ni persiste nada.
 */
export function allocateFixedCosts(input: FixedCostAllocationInput): FixedCostAllocation {
  assertAmount(input.fixedCosts, 'El total de costos fijos');
  const ids = new Set<string>();
  for (const line of input.lines) {
    if (line.id.trim() === '' || ids.has(line.id)) {
      throw new FixedCostAllocationError(
        'INVALID_LINES',
        'Cada línea requiere un identificador no vacío y distinto.',
      );
    }
    ids.add(line.id);
    if (!Number.isSafeInteger(line.unitsProduced) || line.unitsProduced < 0) {
      throw new FixedCostAllocationError(
        'INVALID_UNITS',
        `Las unidades producidas de «${line.id}» deben ser un entero seguro no negativo.`,
      );
    }
    assertAmount(line.recipeCost, `El costo de receta de «${line.id}»`);
    if (line.unitsProduced === 0 && line.recipeCost !== ZERO) {
      throw new FixedCostAllocationError(
        'INCONSISTENT_RECIPE_COST',
        `La línea «${line.id}» tiene costo de receta sin unidades producidas.`,
      );
    }
  }

  const lines = [...input.lines].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const hasBase = lines.some((line) => line.unitsProduced > 0);
  const shares = hasBase
    ? allocate(
        input.fixedCosts,
        lines.map((line) => line.unitsProduced),
      )
    : lines.map(() => ZERO);
  const unallocated = hasBase ? ZERO : input.fixedCosts;

  const result = lines.map((line, index): FixedCostLineAllocation => {
    // allocate conserva la longitud de los pesos.
    const allocated = shares[index]!;
    if (line.unitsProduced === 0) {
      return {
        id: line.id,
        unitsProduced: 0,
        allocated,
        perUnit: null,
        fixedPerUnit: null,
        recipeUnitCost: null,
        realUnitCost: null,
      };
    }
    const units = BigInt(line.unitsProduced);
    const fixed = BigInt(allocated);
    const recipe = BigInt(line.recipeCost);
    return {
      id: line.id,
      unitsProduced: line.unitsProduced,
      allocated,
      perUnit: {
        base: cents(Number(fixed / units)),
        unitsWithExtraCent: Number(fixed % units),
      },
      fixedPerUnit: roundRatioToCents(fixed, units),
      recipeUnitCost: roundRatioToCents(recipe, units),
      realUnitCost: roundRatioToCents(recipe + fixed, units),
    };
  });

  if (add(...result.map((line) => line.allocated), unallocated) !== input.fixedCosts) {
    throw new FixedCostAllocationError(
      'UNBALANCED_ALLOCATION',
      'La suma del prorrateo debe coincidir con el total de costos fijos.',
    );
  }
  return { lines: result, unallocated };
}
