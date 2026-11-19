import { describe, expect, it } from 'vitest';
import { add, cents, fromPesos, MoneyError, ZERO, type Cents } from './money.js';
import {
  calculateProfitSplit,
  ProfitSplitError,
  type ClosingExpense,
  type ProfitSplitInput,
} from './profit-split.js';

const money = fromPesos;

function expense(amount: string, partnerId?: string): ClosingExpense {
  return {
    amount: money(amount),
    paidBy: partnerId === undefined ? { kind: 'cash_box' } : { kind: 'partner', partnerId },
  };
}

function base(overrides: Partial<ProfitSplitInput> = {}): ProfitSplitInput {
  return {
    totalSales: money('3600'),
    expenses: [expense('1400', 'luis'), expense('60', 'socio')],
    partners: [
      { id: 'luis', labor: ZERO },
      { id: 'socio', labor: money('600') },
    ],
    leftoverInventory: ZERO,
    ...overrides,
  };
}

function empty(overrides: Partial<ProfitSplitInput> = {}): ProfitSplitInput {
  return base({
    totalSales: ZERO,
    expenses: [],
    partners: [
      { id: 'luis', labor: ZERO },
      { id: 'socio', labor: ZERO },
    ],
    ...overrides,
  });
}

/** Cada cálculo válido debe conservar exactamente las ventas, incluyendo aportaciones negativas. */
function calculate(input: ProfitSplitInput) {
  const output = calculateProfitSplit(input);
  expect(add(...output.partners.map((partner) => partner.total), output.cashBoxTotal)).toBe(
    input.totalSales,
  );
  expect(output.cashBoxTotal).toBe(add(output.cashBoxRecovery, output.reinvestment));
  expect(output.resultIncludingInventory).toBe(add(output.result, input.leftoverInventory));
  for (const partner of output.partners) {
    expect(partner.recoveredInvestment).toBe(partner.investment);
    expect(partner.total).toBe(
      add(partner.recoveredInvestment, partner.labor, partner.resultShare),
    );
    expect(partner.owes).toBe(partner.total < 0);
  }
  return output;
}

describe('calculateProfitSplit', () => {
  it('§10: recupera inversión y trabajo, y reparte $1,540 con los valores por defecto', () => {
    expect(calculate(base())).toEqual({
      partners: [
        {
          partnerId: 'luis',
          investment: money('1400'),
          recoveredInvestment: money('1400'),
          labor: ZERO,
          resultShare: money('770'),
          total: money('2170'),
          owes: false,
        },
        {
          partnerId: 'socio',
          investment: money('60'),
          recoveredInvestment: money('60'),
          labor: money('600'),
          resultShare: money('770'),
          total: money('1430'),
          owes: false,
        },
      ],
      result: money('1540'),
      reinvestment: ZERO,
      cashBoxRecovery: ZERO,
      cashBoxTotal: ZERO,
      leftoverInventory: ZERO,
      resultIncludingInventory: money('1540'),
    });
  });

  it('§10: aparta 30% de la ganancia antes de repartir', () => {
    const output = calculate(base({ reinvestmentPercent: 30 }));
    expect(output.result).toBe(money('1540'));
    expect(output.reinvestment).toBe(money('462'));
    expect(output.cashBoxTotal).toBe(money('462'));
    expect(output.partners.map((partner) => partner.resultShare)).toEqual([
      money('539'),
      money('539'),
    ]);
    expect(output.partners.map((partner) => partner.total)).toEqual([money('1939'), money('1199')]);
  });

  it.each([0, 30])(
    '§10: reparte la pérdida y conserva el total negativo, reinversión configurada %i%%',
    (reinvestmentPercent) => {
      const output = calculate(
        empty({ totalSales: money('1000'), expenses: base().expenses, reinvestmentPercent }),
      );
      expect(output.result).toBe(money('-460'));
      expect(output.reinvestment).toBe(ZERO);
      expect(output.partners.map((partner) => partner.resultShare)).toEqual([
        money('-230'),
        money('-230'),
      ]);
      expect(output.partners.map((partner) => [partner.total, partner.owes])).toEqual([
        [money('1170'), false],
        [money('-170'), true],
      ]);
    },
  );

  it('Nochebuena: suma plantas y gasolina de Luis y paga el trabajo aun con pérdida', () => {
    const output = calculate(
      base({
        totalSales: money('1380'),
        expenses: [expense('900', 'luis'), expense('500', 'luis'), expense('50', 'socio')],
      }),
    );
    expect(output.result).toBe(money('-670'));
    expect(output.partners.map((partner) => partner.investment)).toEqual([
      money('1400'),
      money('50'),
    ]);
    expect(output.partners.map((partner) => partner.resultShare)).toEqual([
      money('-335'),
      money('-335'),
    ]);
    expect(output.partners.map((partner) => [partner.total, partner.owes])).toEqual([
      [money('1065'), false],
      [money('315'), false],
    ]);
  });

  it.each([
    { sales: '100', result: '80', share: '40', owes: false },
    { sales: '10', result: '-10', share: '-5', owes: true },
  ])(
    'caja recupera $20 completos con ventas de $$sales; no es inversión personal',
    ({ sales, result, share, owes }) => {
      const output = calculate(
        empty({ totalSales: money(sales), expenses: [expense('12'), expense('8')] }),
      );
      expect(output.result).toBe(money(result));
      expect(output.cashBoxRecovery).toBe(money('20'));
      expect(output.cashBoxTotal).toBe(money('20'));
      expect(output.reinvestment).toBe(ZERO);
      for (const partner of output.partners) {
        expect(partner.investment).toBe(ZERO);
        expect(partner.recoveredInvestment).toBe(ZERO);
        expect(partner.resultShare).toBe(money(share));
        expect(partner.total).toBe(money(share));
        expect(partner.owes).toBe(owes);
      }
    },
  );

  it('caso mixto: separa recuperación de caja $100 y reinversión $432', () => {
    const output = calculate(
      base({ expenses: [...base().expenses, expense('100')], reinvestmentPercent: 30 }),
    );
    expect(output.result).toBe(money('1440'));
    expect(output.cashBoxRecovery).toBe(money('100'));
    expect(output.reinvestment).toBe(money('432'));
    expect(output.cashBoxTotal).toBe(money('532'));
    expect(output.partners.map((partner) => partner.resultShare)).toEqual([
      money('504'),
      money('504'),
    ]);
    expect(output.partners.map((partner) => partner.total)).toEqual([money('1904'), money('1164')]);
  });

  it.each(['0', '200'])('inventario de $%s es informativo y no cambia los pagos', (inventory) => {
    const original = calculate(base({ reinvestmentPercent: 30 }));
    const output = calculate(
      base({ reinvestmentPercent: 30, leftoverInventory: money(inventory) }),
    );
    expect(output).toEqual({
      ...original,
      leftoverInventory: money(inventory),
      resultIncludingInventory: add(original.result, money(inventory)),
    });
  });

  it('inventario no convierte una pérdida en efectivo ni habilita reinversión', () => {
    const output = calculate(
      empty({ expenses: [expense('1')], leftoverInventory: money('200'), reinvestmentPercent: 30 }),
    );
    expect(output.result).toBe(money('-1'));
    expect(output.resultIncludingInventory).toBe(money('199'));
    expect(output.reinvestment).toBe(ZERO);
    expect(output.partners.map((partner) => partner.total)).toEqual([
      money('-0.50'),
      money('-0.50'),
    ]);
  });

  it.each([false, true])(
    'asigna el centavo impar por ID ascendente, también con pérdida=%s',
    (loss) => {
      const input = empty(loss ? { expenses: [expense('1.01')] } : { totalSales: money('1.01') });
      const output = calculate(input);
      expect(output.partners.map((partner) => partner.resultShare)).toEqual(
        loss ? [cents(-51), cents(-50)] : [cents(51), cents(50)],
      );
      expect(calculate({ ...input, partners: [input.partners[1], input.partners[0]] })).toEqual(
        output,
      );
    },
  );

  it.each([
    { shares: [70, 30], expected: [71, 30] },
    { shares: [33.3, 66.7], expected: [34, 67] },
    { shares: [0, 100], expected: [0, 101] },
    { shares: [100, 0], expected: [101, 0] },
  ])(
    'respeta participaciones $shares y omite pesos cero al asignar residuo',
    ({ shares, expected }) => {
      const output = calculate(
        empty({
          totalSales: cents(101),
          partners: [
            { id: 'luis', labor: ZERO, sharePercent: shares[0]! },
            { id: 'socio', labor: ZERO, sharePercent: shares[1]! },
          ],
        }),
      );
      expect(output.partners.map((partner) => partner.resultShare)).toEqual(expected);
    },
  );

  it('ordena por UTF-16, no por idioma, y conserva la participación asociada al ID', () => {
    const input = empty({
      totalSales: cents(101),
      partners: [
        { id: 'a', labor: ZERO, sharePercent: 70 },
        { id: 'Z', labor: ZERO, sharePercent: 30 },
      ],
    });
    const output = calculate(input);
    expect(output.partners.map((partner) => [partner.partnerId, partner.resultShare])).toEqual([
      ['Z', cents(31)],
      ['a', cents(70)],
    ]);
    expect(calculate({ ...input, partners: [input.partners[1], input.partners[0]] })).toEqual(
      output,
    );
  });

  it('la pérdida también respeta participaciones distintas de 50/50', () => {
    const output = calculate(
      empty({
        expenses: [expense('10')],
        reinvestmentPercent: 100,
        partners: [
          { id: 'luis', labor: ZERO, sharePercent: 70 },
          { id: 'socio', labor: ZERO, sharePercent: 30 },
        ],
      }),
    );
    expect(output.partners.map((partner) => partner.total)).toEqual([money('-7'), money('-3')]);
    expect(output.reinvestment).toBe(ZERO);
  });

  it('con reinversión 100% los socios solo recuperan inversión y trabajo', () => {
    const output = calculate(base({ reinvestmentPercent: 100 }));
    expect(output.reinvestment).toBe(money('1540'));
    expect(output.partners.map((partner) => partner.resultShare)).toEqual([ZERO, ZERO]);
    expect(output.partners.map((partner) => partner.total)).toEqual([money('1400'), money('660')]);
  });

  it('redondea half-up la reinversión antes de asignar el residuo', () => {
    const output = calculate(empty({ totalSales: cents(5), reinvestmentPercent: 10 }));
    expect(output.reinvestment).toBe(cents(1));
    expect(output.partners.map((partner) => partner.total)).toEqual([cents(2), cents(2)]);
  });

  it('sin movimientos devuelve ceros sin marcar deudas', () => {
    const output = calculate(empty());
    expect(output.result).toBe(ZERO);
    expect(output.cashBoxTotal).toBe(ZERO);
    expect(output.partners.map((partner) => [partner.total, partner.owes])).toEqual([
      [ZERO, false],
      [ZERO, false],
    ]);
  });

  it('en equilibrio recupera inversión, caja y trabajo sin reinvertir', () => {
    const output = calculate(
      base({
        totalSales: money('2160'),
        expenses: [...base().expenses, expense('100')],
        reinvestmentPercent: 30,
      }),
    );
    expect(output.result).toBe(ZERO);
    expect(output.reinvestment).toBe(ZERO);
    expect(output.partners.map((partner) => partner.total)).toEqual([money('1400'), money('660')]);
    expect(output.cashBoxTotal).toBe(money('100'));
  });

  it('es determinista y no modifica las entradas', () => {
    const input = base();
    const before = structuredClone(input);
    Object.freeze(input.partners);
    for (const partner of input.partners) Object.freeze(partner);
    Object.freeze(input.expenses);
    for (const item of input.expenses) {
      Object.freeze(item.paidBy);
      Object.freeze(item);
    }
    Object.freeze(input);
    expect(calculate(input)).toEqual(calculate(input));
    expect(input).toEqual(before);
  });
});

describe('validación del cierre', () => {
  function expectError(input: ProfitSplitInput, code: string, message: RegExp) {
    expect(() => calculateProfitSplit(input)).toThrow(ProfitSplitError);
    expect(() => calculateProfitSplit(input)).toThrow(
      expect.objectContaining({ code, message: expect.stringMatching(message) }),
    );
  }

  it.each([
    [-1, 101],
    [NaN, 50],
    [Infinity, 50],
    [101, -1],
  ])('rechaza participaciones inválidas %s/%s', (first, second) => {
    expectError(
      empty({
        partners: [
          { id: 'luis', labor: ZERO, sharePercent: first },
          { id: 'socio', labor: ZERO, sharePercent: second },
        ],
      }),
      'INVALID_SHARES',
      /participaciones.*entre 0.*100/i,
    );
  });

  it.each([
    [40, 50],
    [0, 0],
    [70, undefined],
  ])('rechaza participaciones que no suman 100: %s/%s', (first, second) => {
    expectError(
      empty({
        partners: [
          { id: 'luis', labor: ZERO, sharePercent: first },
          { id: 'socio', labor: ZERO, ...(second === undefined ? {} : { sharePercent: second }) },
        ],
      }),
      'INVALID_SHARES',
      /participaciones.*sumar 100/i,
    );
  });

  it.each([-1, 101, NaN, Infinity])('rechaza reinversión inválida %s', (reinvestmentPercent) => {
    expectError(
      base({ reinvestmentPercent }),
      'INVALID_REINVESTMENT',
      /reinversión.*entre 0.*100/i,
    );
  });

  it.each(['', ' ', 'luis'])('rechaza ID vacío o repetido: "%s"', (id) => {
    expectError(
      empty({
        partners: [
          { id: 'luis', labor: ZERO },
          { id, labor: ZERO },
        ],
      }),
      'INVALID_PARTNERS',
      /socios/i,
    );
  });

  it('valida en ejecución que existan exactamente dos socios', () => {
    expectError(
      { ...empty(), partners: [] } as unknown as ProfitSplitInput,
      'INVALID_PARTNERS',
      /dos socios/i,
    );
  });

  it('rechaza gastos de un socio desconocido', () => {
    expectError(
      base({ expenses: [expense('1', 'desconocido')] }),
      'UNKNOWN_PARTNER',
      /desconocido/i,
    );
  });

  const amountFields = [
    { name: 'ventas', input: (amount: Cents) => base({ totalSales: amount }) },
    {
      name: 'gasto de socio',
      input: (amount: Cents) => base({ expenses: [{ ...expense('1', 'luis'), amount }] }),
    },
    {
      name: 'gasto de caja',
      input: (amount: Cents) => base({ expenses: [{ ...expense('1'), amount }] }),
    },
    {
      name: 'trabajo',
      input: (amount: Cents) =>
        base({
          partners: [
            { id: 'luis', labor: amount },
            { id: 'socio', labor: ZERO },
          ],
        }),
    },
    { name: 'inventario', input: (amount: Cents) => base({ leftoverInventory: amount }) },
  ];
  describe.each(amountFields)('$name', ({ input }) => {
    it.each([0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
      'rechaza monto no entero seguro %s',
      (value) => {
        expectError(input(value as Cents), 'INVALID_AMOUNT', /entero.*centavos/i);
      },
    );
    it('rechaza monto negativo', () => {
      expectError(input(cents(-1)), 'NEGATIVE_AMOUNT', /no puede ser negativo/i);
    });
  });

  it('propaga MoneyError si la suma monetaria desborda el entero seguro', () => {
    expect(() =>
      calculateProfitSplit(
        empty({
          expenses: [
            { amount: cents(Number.MAX_SAFE_INTEGER), paidBy: { kind: 'cash_box' } },
            expense('1'),
          ],
        }),
      ),
    ).toThrow(MoneyError);
  });
});
