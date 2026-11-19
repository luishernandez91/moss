/** Cierre y reparto puro: especificación §5 pantalla 17, §7 pantalla 22 y §8 reglas 1, 7 y 9. */
import { add, allocate, percentage, subtract, ZERO, type Cents } from './money.js';

export interface ClosingPartner {
  id: string;
  /** Trabajo registrado pendiente de pago; no incluirlo también como gasto. */
  labor: Cents;
  /** Participación en ganancia o pérdida, 50% por defecto. */
  sharePercent?: number;
}

export interface ClosingExpense {
  amount: Cents;
  paidBy: { kind: 'partner'; partnerId: string } | { kind: 'cash_box' };
}

export interface ProfitSplitInput {
  totalSales: Cents;
  expenses: readonly ClosingExpense[];
  partners: readonly [ClosingPartner, ClosingPartner];
  /** Entre 0 y 100, incluidos; por defecto 0. Solo aplica con resultado positivo. */
  reinvestmentPercent?: number;
  /** Valuado a costo por quien llama; el producto de temporada ya debe llegar en cero. */
  leftoverInventory: Cents;
}

export interface PartnerProfitSplit {
  partnerId: string;
  investment: Cents;
  /** Recuperación íntegra; la pérdida se refleja por separado en resultShare. */
  recoveredInvestment: Cents;
  labor: Cents;
  resultShare: Cents;
  /** Puede ser negativo: no se limita a cero. */
  total: Cents;
  /** Permite a la interfaz mostrar «Debe aportar». */
  owes: boolean;
}

export interface ProfitSplit {
  /** Orden ascendente de ID, por comparación de cadenas sin depender del idioma. */
  partners: readonly PartnerProfitSplit[];
  result: Cents;
  reinvestment: Cents;
  /** La caja recupera todo lo que pagó, incluso con pérdida; no participa en el resultado. */
  cashBoxRecovery: Cents;
  cashBoxTotal: Cents;
  leftoverInventory: Cents;
  /** Informativo: el inventario no es efectivo y nunca se reparte. */
  resultIncludingInventory: Cents;
}

export type ProfitSplitErrorCode =
  | 'INVALID_PARTNERS'
  | 'UNKNOWN_PARTNER'
  | 'INVALID_SHARES'
  | 'INVALID_REINVESTMENT'
  | 'INVALID_AMOUNT'
  | 'NEGATIVE_AMOUNT'
  | 'UNBALANCED_SPLIT';

export class ProfitSplitError extends Error {
  override name = 'ProfitSplitError';
  constructor(
    readonly code: ProfitSplitErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function assertAmount(amount: Cents, label: string): void {
  if (!Number.isSafeInteger(amount)) {
    throw new ProfitSplitError('INVALID_AMOUNT', `${label} debe ser un entero seguro de centavos.`);
  }
  if (amount < 0) {
    throw new ProfitSplitError('NEGATIVE_AMOUNT', `${label} no puede ser negativo.`);
  }
}

function isValidPercent(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

/**
 * Recupera inversión (socios y caja), paga trabajo, aparta reinversión y reparte el resultado.
 * Los socios absorben toda la pérdida según sus participaciones; la caja recupera íntegro.
 * allocate recibe los socios por ID ascendente (comparación UTF-16, sin localeCompare): el primer
 * socio con participación positiva recibe el centavo residual, también en pérdidas (negativo).
 * El orden de entrada no altera el reparto. No modifica entradas ni cambia el estado de campaña:
 * la transición de cierre y sus permisos pertenecen a D4.
 */
export function calculateProfitSplit(input: ProfitSplitInput): ProfitSplit {
  if (
    input.partners.length !== 2 ||
    input.partners.some((partner) => partner.id.trim() === '') ||
    new Set(input.partners.map((partner) => partner.id)).size !== 2
  ) {
    throw new ProfitSplitError(
      'INVALID_PARTNERS',
      'Se requieren dos socios con identificadores distintos y no vacíos.',
    );
  }

  const partners = [...input.partners].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const weights = partners.map((partner) => partner.sharePercent ?? 50);
  if (weights.some((weight) => !isValidPercent(weight))) {
    throw new ProfitSplitError(
      'INVALID_SHARES',
      'Las participaciones deben estar entre 0% y 100%.',
    );
  }
  if (weights.reduce((sum, weight) => sum + weight, 0) !== 100) {
    throw new ProfitSplitError(
      'INVALID_SHARES',
      'Las participaciones de los socios deben sumar 100%.',
    );
  }
  const reinvestmentPercent = input.reinvestmentPercent ?? 0;
  if (!isValidPercent(reinvestmentPercent)) {
    throw new ProfitSplitError(
      'INVALID_REINVESTMENT',
      'El porcentaje de reinversión debe estar entre 0% y 100%.',
    );
  }

  assertAmount(input.totalSales, 'El total de ventas');
  assertAmount(input.leftoverInventory, 'El inventario sobrante');
  const investments = new Map<string, Cents>();
  let totalLabor = ZERO;
  for (const partner of partners) {
    assertAmount(partner.labor, `El trabajo del socio «${partner.id}»`);
    totalLabor = add(totalLabor, partner.labor);
    investments.set(partner.id, ZERO);
  }

  let totalExpenses = ZERO;
  let cashBoxRecovery = ZERO;
  for (const expense of input.expenses) {
    assertAmount(expense.amount, 'El gasto');
    totalExpenses = add(totalExpenses, expense.amount);
    if (expense.paidBy.kind === 'cash_box') {
      cashBoxRecovery = add(cashBoxRecovery, expense.amount);
    } else {
      const { partnerId } = expense.paidBy;
      const investment = investments.get(partnerId);
      if (investment === undefined) {
        throw new ProfitSplitError(
          'UNKNOWN_PARTNER',
          `El gasto pertenece al socio desconocido «${partnerId}».`,
        );
      }
      investments.set(partnerId, add(investment, expense.amount));
    }
  }

  const result = subtract(subtract(input.totalSales, totalExpenses), totalLabor);
  const reinvestment = result > 0 ? percentage(result, reinvestmentPercent) : ZERO;
  const shares = allocate(subtract(result, reinvestment), weights);
  const split = partners.map((partner, index): PartnerProfitSplit => {
    // Ambos índices existen: investments se inicializa por socio y allocate conserva la longitud.
    const investment = investments.get(partner.id)!;
    const resultShare = shares[index]!;
    const total = add(investment, partner.labor, resultShare);
    return {
      partnerId: partner.id,
      investment,
      recoveredInvestment: investment,
      labor: partner.labor,
      resultShare,
      total,
      owes: total < 0,
    };
  });
  const cashBoxTotal = add(cashBoxRecovery, reinvestment);
  if (add(...split.map((partner) => partner.total), cashBoxTotal) !== input.totalSales) {
    throw new ProfitSplitError(
      'UNBALANCED_SPLIT',
      'Los totales de los socios más la caja deben coincidir con las ventas.',
    );
  }

  return {
    partners: split,
    result,
    reinvestment,
    cashBoxRecovery,
    cashBoxTotal,
    leftoverInventory: input.leftoverInventory,
    resultIncludingInventory: add(result, input.leftoverInventory),
  };
}
