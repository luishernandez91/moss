/** Cierre y reparto puro: especificación §5 pantalla 17, §7 pantalla 22 y §8 reglas 1, 7 y 9. */
import { add, allocate, percentageBps, subtract, ZERO, type Cents } from './money.js';

export interface ClosingPartner {
  id: string;
  /** Trabajo devengado en esta campaña; no incluirlo también como gasto. */
  labor: Cents;
  /** Participación en puntos base enteros, 5000 (50%) por defecto. */
  shareBps?: number;
}

export interface ClosingExpense {
  amount: Cents;
  paidBy: { kind: 'partner'; partnerId: string } | { kind: 'cash_box' };
}

export interface PartnerContribution {
  partnerId: string;
  amount: Cents;
}

export interface ProfitSplitInput {
  totalSales: Cents;
  expenses: readonly ClosingExpense[];
  /** Aportaciones a caja: capital del socio, no gasto. Por defecto []. */
  contributions?: readonly PartnerContribution[];
  partners: readonly [ClosingPartner, ClosingPartner];
  /** Puntos base enteros entre 0 y 10000; por defecto 0. Solo tras pagar todo el trabajo. */
  reinvestmentBps?: number;
  /** Valuado a costo por quien llama; el producto de temporada ya debe llegar en cero. */
  leftoverInventory: Cents;
}

export interface PartnerProfitSplit {
  partnerId: string;
  /** Capital: gastos pagados por el socio más sus aportaciones a caja. */
  investment: Cents;
  /** Recuperación íntegra; la pérdida se refleja por separado en resultShare. */
  recoveredInvestment: Cents;
  labor: Cents;
  laborPaid: Cents;
  /** Informativo: no genera deuda ni se arrastra a otra campaña. */
  laborUnpaid: Cents;
  resultShare: Cents;
  /** Puede ser negativo: no se limita a cero. */
  total: Cents;
  /** Permite a la interfaz mostrar «Debe aportar». */
  owes: boolean;
}

export interface ProfitSplit {
  /** Orden ascendente de ID, por comparación de cadenas sin depender del idioma. */
  partners: readonly PartnerProfitSplit[];
  /** Indicador informativo: ventas − gastos − todo el trabajo devengado. */
  result: Cents;
  reinvestment: Cents;
  /** Caja neta: gastos de caja − aportaciones. Negativo significa devolución de caja. */
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

function isValidBps(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 10000;
}

/**
 * Recupera caja neta y capital; con el remanente paga trabajo (a prorrata si es insuficiente).
 * Solo tras pagar todo el trabajo aparta reinversión y reparte ganancia. Si falta capital,
 * los socios absorben esa pérdida según sus participaciones y no se paga trabajo.
 * allocate recibe los socios por ID ascendente (comparación UTF-16, sin localeCompare): el primer
 * socio con peso positivo recibe el centavo residual, también en pérdidas (negativo).
 * Para trabajo, los pesos son los importes devengados; para ganancia/pérdida, shareBps.
 * El orden de entrada no altera el reparto. No modifica entradas ni cambia el estado de campaña:
 * la transición de cierre y sus permisos pertenecen a D4.
 * Aplica a cierres desde esta decisión; K7 debe guardar el snapshot y no recalcular liquidados.
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
  const weights = partners.map((partner) => partner.shareBps ?? 5000);
  if (weights.some((weight) => !isValidBps(weight))) {
    throw new ProfitSplitError(
      'INVALID_SHARES',
      'Las participaciones deben ser puntos base enteros seguros entre 0 y 10000.',
    );
  }
  if (weights.reduce((sum, weight) => sum + weight, 0) !== 10000) {
    throw new ProfitSplitError(
      'INVALID_SHARES',
      'Las participaciones de los socios deben sumar 10000 puntos base.',
    );
  }
  const reinvestmentBps = input.reinvestmentBps ?? 0;
  if (!isValidBps(reinvestmentBps)) {
    throw new ProfitSplitError(
      'INVALID_REINVESTMENT',
      'Los puntos base de reinversión deben ser enteros seguros entre 0 y 10000.',
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

  for (const contribution of input.contributions ?? []) {
    assertAmount(contribution.amount, 'La aportación');
    const investment = investments.get(contribution.partnerId);
    if (investment === undefined) {
      throw new ProfitSplitError(
        'UNKNOWN_PARTNER',
        `La aportación pertenece al socio desconocido «${contribution.partnerId}».`,
      );
    }
    investments.set(contribution.partnerId, add(investment, contribution.amount));
    cashBoxRecovery = subtract(cashBoxRecovery, contribution.amount);
  }

  // Caja neta + capital = todos los gastos: las aportaciones se cancelan entre ambos.
  const afterCapital = subtract(input.totalSales, totalExpenses);
  const result = subtract(afterCapital, totalLabor);
  const laborBudget =
    afterCapital > ZERO ? (afterCapital < totalLabor ? afterCapital : totalLabor) : ZERO;
  const laborPayments =
    laborBudget > ZERO
      ? allocate(
          laborBudget,
          partners.map((partner) => partner.labor),
        )
      : partners.map(() => ZERO);
  // Negativo: pérdida de capital. Cero: trabajo parcial/equilibrio. Positivo: ganancia repartible.
  const distributable = subtract(afterCapital, laborBudget);
  const reinvestment = distributable > ZERO ? percentageBps(distributable, reinvestmentBps) : ZERO;
  const shares = allocate(subtract(distributable, reinvestment), weights);
  const split = partners.map((partner, index): PartnerProfitSplit => {
    // Ambos índices existen: investments se inicializa por socio y allocate conserva la longitud.
    const investment = investments.get(partner.id)!;
    const resultShare = shares[index]!;
    const laborPaid = laborPayments[index]!;
    const total = add(investment, laborPaid, resultShare);
    return {
      partnerId: partner.id,
      investment,
      recoveredInvestment: investment,
      labor: partner.labor,
      laborPaid,
      laborUnpaid: subtract(partner.labor, laborPaid),
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
