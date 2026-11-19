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

/** Cada cálculo válido debe conservar exactamente las ventas, incluyendo totales negativos. */
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
      add(partner.recoveredInvestment, partner.laborPaid, partner.resultShare),
    );
    expect(partner.owes).toBe(partner.total < 0);
    expect(add(partner.laborPaid, partner.laborUnpaid)).toBe(partner.labor);
    expect(partner.laborPaid).toBeGreaterThanOrEqual(0);
    expect(partner.laborPaid).toBeLessThanOrEqual(partner.labor);
    expect(partner.laborUnpaid).toBeGreaterThanOrEqual(0);
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
          laborPaid: ZERO,
          laborUnpaid: ZERO,
          resultShare: money('770'),
          total: money('2170'),
          owes: false,
        },
        {
          partnerId: 'socio',
          investment: money('60'),
          recoveredInvestment: money('60'),
          labor: money('600'),
          laborPaid: money('600'),
          laborUnpaid: ZERO,
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
    const output = calculate(base({ reinvestmentBps: 3000 }));
    expect(output.result).toBe(money('1540'));
    expect(output.reinvestment).toBe(money('462'));
    expect(output.cashBoxTotal).toBe(money('462'));
    expect(output.partners.map((partner) => partner.resultShare)).toEqual([
      money('539'),
      money('539'),
    ]);
    expect(output.partners.map((partner) => partner.total)).toEqual([money('1939'), money('1199')]);
  });

  it.each([0, 3000])(
    '§10: reparte la pérdida y conserva el total negativo, reinversión configurada %i bps',
    (reinvestmentBps) => {
      const output = calculate(
        empty({ totalSales: money('1000'), expenses: base().expenses, reinvestmentBps }),
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

  it('Nochebuena: reparte solo la pérdida de capital y deja el trabajo impago', () => {
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
      money('-35'),
      money('-35'),
    ]);
    expect(output.partners.map((partner) => [partner.total, partner.owes])).toEqual([
      [money('1365'), false],
      [money('15'), false],
    ]);
    expect(output.partners.map((partner) => partner.laborPaid)).toEqual([ZERO, ZERO]);
    expect(output.partners.map((partner) => partner.laborUnpaid)).toEqual([ZERO, money('600')]);
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
      base({ expenses: [...base().expenses, expense('100')], reinvestmentBps: 3000 }),
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
    const original = calculate(base({ reinvestmentBps: 3000 }));
    const output = calculate(base({ reinvestmentBps: 3000, leftoverInventory: money(inventory) }));
    expect(output).toEqual({
      ...original,
      leftoverInventory: money(inventory),
      resultIncludingInventory: add(original.result, money(inventory)),
    });
  });

  it('inventario no convierte una pérdida en efectivo ni habilita reinversión', () => {
    const output = calculate(
      empty({ expenses: [expense('1')], leftoverInventory: money('200'), reinvestmentBps: 3000 }),
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
    { shares: [7000, 3000], expected: [71, 30] },
    { shares: [3333, 6667], expected: [34, 67] },
    { shares: [0, 10000], expected: [0, 101] },
    { shares: [10000, 0], expected: [101, 0] },
  ])(
    'respeta participaciones $shares y omite pesos cero al asignar residuo',
    ({ shares, expected }) => {
      const output = calculate(
        empty({
          totalSales: cents(101),
          partners: [
            { id: 'luis', labor: ZERO, shareBps: shares[0]! },
            { id: 'socio', labor: ZERO, shareBps: shares[1]! },
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
        { id: 'a', labor: ZERO, shareBps: 7000 },
        { id: 'Z', labor: ZERO, shareBps: 3000 },
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
        reinvestmentBps: 10000,
        partners: [
          { id: 'luis', labor: ZERO, shareBps: 7000 },
          { id: 'socio', labor: ZERO, shareBps: 3000 },
        ],
      }),
    );
    expect(output.partners.map((partner) => partner.total)).toEqual([money('-7'), money('-3')]);
    expect(output.reinvestment).toBe(ZERO);
  });

  it('con reinversión 100% los socios solo recuperan inversión y trabajo', () => {
    const output = calculate(base({ reinvestmentBps: 10000 }));
    expect(output.reinvestment).toBe(money('1540'));
    expect(output.partners.map((partner) => partner.resultShare)).toEqual([ZERO, ZERO]);
    expect(output.partners.map((partner) => partner.total)).toEqual([money('1400'), money('660')]);
  });

  it('redondea half-up la reinversión antes de asignar el residuo', () => {
    const output = calculate(empty({ totalSales: cents(5), reinvestmentBps: 1000 }));
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
        reinvestmentBps: 3000,
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

describe('cascada y aportaciones', () => {
  it('paga $200 de trabajo de Luis tras recuperar los $1,000 del otro socio', () => {
    const output = calculate(
      empty({
        totalSales: money('1200'),
        expenses: [expense('1000', 'socio')],
        partners: [
          { id: 'luis', labor: money('400') },
          { id: 'socio', labor: ZERO },
        ],
        reinvestmentBps: 3000,
      }),
    );
    expect(output.result).toBe(money('-200'));
    expect(output.partners.map((p) => p.total)).toEqual([money('200'), money('1000')]);
    expect(output.partners.map((p) => p.laborPaid)).toEqual([money('200'), ZERO]);
    expect(output.partners.map((p) => p.laborUnpaid)).toEqual([money('200'), ZERO]);
    expect(output.partners.map((p) => p.resultShare)).toEqual([ZERO, ZERO]);
    expect(output.partners.map((p) => p.owes)).toEqual([false, false]);
    expect(output.reinvestment).toBe(ZERO);
  });

  it('ventas $600 contra capital $1,000: pierde $200 cada socio y no paga trabajo', () => {
    const output = calculate(
      empty({
        totalSales: money('600'),
        expenses: [expense('700', 'socio'), expense('300', 'luis')],
        partners: [
          { id: 'luis', labor: money('400') },
          { id: 'socio', labor: ZERO },
        ],
        reinvestmentBps: 3000,
      }),
    );
    expect(output.result).toBe(money('-800'));
    expect(output.partners.map((p) => p.total)).toEqual([money('100'), money('500')]);
    expect(output.partners.map((p) => p.resultShare)).toEqual([money('-200'), money('-200')]);
    expect(output.partners.map((p) => p.laborPaid)).toEqual([ZERO, ZERO]);
    expect(output.partners.map((p) => p.laborUnpaid)).toEqual([money('400'), ZERO]);
    expect(output.reinvestment).toBe(ZERO);
  });

  it('prorratea trabajo por importes devengados, independientemente de la participación', () => {
    const output = calculate(
      empty({
        totalSales: money('1300'),
        expenses: [expense('1000', 'socio')],
        partners: [
          { id: 'luis', labor: money('400'), shareBps: 0 },
          { id: 'socio', labor: money('200'), shareBps: 10000 },
        ],
        reinvestmentBps: 10000,
      }),
    );
    expect(output.partners.map((p) => p.laborPaid)).toEqual([money('200'), money('100')]);
    expect(output.partners.map((p) => p.laborUnpaid)).toEqual([money('200'), money('100')]);
    expect(output.partners.map((p) => p.total)).toEqual([money('200'), money('1100')]);
    expect(output.partners.map((p) => p.resultShare)).toEqual([ZERO, ZERO]);
    expect(output.reinvestment).toBe(ZERO);
  });

  it('el centavo residual de trabajo sigue ID UTF-16 y no rebasa el trabajo devengado', () => {
    const input = empty({
      totalSales: cents(1),
      partners: [
        { id: 'a', labor: cents(1) },
        { id: 'Z', labor: cents(1) },
      ],
    });
    const output = calculate(input);
    expect(output.partners.map((p) => [p.partnerId, p.laborPaid, p.laborUnpaid])).toEqual([
      ['Z', 1, 0],
      ['a', 0, 1],
    ]);
    expect(calculate({ ...input, partners: [input.partners[1], input.partners[0]] })).toEqual(
      output,
    );
  });

  it.each([
    { sales: '1000', paid: '0', unpaid: '400' },
    { sales: '1400', paid: '400', unpaid: '0' },
  ])('frontera exacta con ventas $sales: trabajo pagado $paid', ({ sales, paid, unpaid }) => {
    const output = calculate(
      empty({
        totalSales: money(sales),
        expenses: [expense('1000', 'socio')],
        partners: [
          { id: 'luis', labor: money('400') },
          { id: 'socio', labor: ZERO },
        ],
        reinvestmentBps: 3000,
      }),
    );
    expect(output.partners[0]!.laborPaid).toBe(money(paid));
    expect(output.partners[0]!.laborUnpaid).toBe(money(unpaid));
    expect(output.partners.map((p) => p.resultShare)).toEqual([ZERO, ZERO]);
    expect(output.reinvestment).toBe(ZERO);
  });

  it('las aportaciones omitidas equivalen a []', () => {
    expect(calculate(base())).toEqual(calculate(base({ contributions: [] })));
  });

  it('acumula aportaciones de ambos socios sin duplicar gastos ni cambiar el resultado', () => {
    const expenses = [expense('100', 'luis'), expense('50', 'socio'), expense('200')];
    const original = calculate(empty({ totalSales: money('500'), expenses }));
    const output = calculate(
      empty({
        totalSales: money('500'),
        expenses,
        contributions: [
          { partnerId: 'luis', amount: money('60') },
          { partnerId: 'luis', amount: money('40') },
          { partnerId: 'socio', amount: money('50') },
        ],
      }),
    );
    expect(output.result).toBe(original.result);
    expect(output.result).toBe(money('150'));
    expect(output.partners.map((p) => p.investment)).toEqual([money('200'), money('100')]);
    expect(output.partners.map((p) => p.total)).toEqual([money('275'), money('175')]);
    expect(output.cashBoxRecovery).toBe(money('50'));
  });

  it('una aportación que financia todos los gastos de caja deja recuperación neta cero', () => {
    const output = calculate(
      empty({
        totalSales: money('100'),
        expenses: [expense('100')],
        contributions: [{ partnerId: 'luis', amount: money('100') }],
      }),
    );
    expect(output.cashBoxRecovery).toBe(ZERO);
    expect(output.partners.map((p) => p.total)).toEqual([money('100'), ZERO]);
    expect(output.result).toBe(ZERO);
  });

  it.each([
    { sales: '100', bps: 0, totals: ['90', '40'], recovery: '-30', reinvestment: '0', cash: '-30' },
    {
      sales: '100',
      bps: 3000,
      totals: ['78', '28'],
      recovery: '-30',
      reinvestment: '24',
      cash: '-6',
    },
    {
      sales: '10',
      bps: 3000,
      totals: ['45', '-5'],
      recovery: '-30',
      reinvestment: '0',
      cash: '-30',
    },
  ])(
    'caja neta negativa devuelve aportación no gastada: ventas $sales, reinversión $bps bps',
    ({ sales, bps, totals, recovery, reinvestment, cash }) => {
      const output = calculate(
        empty({
          totalSales: money(sales),
          expenses: [expense('20')],
          contributions: [{ partnerId: 'luis', amount: money('50') }],
          reinvestmentBps: bps,
        }),
      );
      expect(output.cashBoxRecovery).toBe(money(recovery));
      expect(output.reinvestment).toBe(money(reinvestment));
      expect(output.cashBoxTotal).toBe(money(cash));
      expect(output.partners.map((p) => p.total)).toEqual(totals.map(money));
    },
  );

  it('sin gastos ni ventas devuelve las aportaciones desde caja, sin pérdida', () => {
    const output = calculate(
      empty({ contributions: [{ partnerId: 'socio', amount: money('50') }] }),
    );
    expect(output.cashBoxTotal).toBe(money('-50'));
    expect(output.partners.map((p) => p.total)).toEqual([ZERO, money('50')]);
    expect(output.result).toBe(ZERO);
  });

  it('recupera caja neta antes del trabajo aun si ambos socios deben aportar', () => {
    const output = calculate(
      empty({
        totalSales: money('10'),
        expenses: [expense('20')],
        partners: [
          { id: 'luis', labor: money('400') },
          { id: 'socio', labor: money('200') },
        ],
      }),
    );
    expect(output.cashBoxRecovery).toBe(money('20'));
    expect(output.partners.map((p) => [p.total, p.laborPaid, p.owes])).toEqual([
      [money('-5'), ZERO, true],
      [money('-5'), ZERO, true],
    ]);
  });

  it('el trabajo impago es informativo: no genera deuda ni se arrastra a otra campaña', () => {
    const output = calculate(
      empty({
        partners: [
          { id: 'luis', labor: money('400') },
          { id: 'socio', labor: ZERO },
        ],
      }),
    );
    expect(output.partners[0]!.laborUnpaid).toBe(money('400'));
    expect(output.partners.map((p) => [p.total, p.resultShare, p.owes])).toEqual([
      [ZERO, ZERO, false],
      [ZERO, ZERO, false],
    ]);
    expect(calculate(empty()).partners.map((p) => p.laborUnpaid)).toEqual([ZERO, ZERO]);
  });

  it('no modifica ni reordena las aportaciones de entrada', () => {
    const contributions = Object.freeze([
      Object.freeze({ partnerId: 'socio', amount: money('10') }),
      Object.freeze({ partnerId: 'luis', amount: money('20') }),
    ]);
    const input = base({ contributions });
    const before = structuredClone(input);
    expect(calculate(input)).toEqual(calculate(input));
    expect(input).toEqual(before);
  });

  it('un monto grande conserva cada centavo al reinvertir 10000 bps', () => {
    const output = calculate(empty({ totalSales: cents(100000000000001), reinvestmentBps: 10000 }));
    expect(output.reinvestment).toBe(cents(100000000000001));
    expect(output.partners.map((p) => p.total)).toEqual([ZERO, ZERO]);
  });

  it('reparte montos grandes con pesos enteros exactos', () => {
    const output = calculate(
      empty({
        totalSales: cents(Number.MAX_SAFE_INTEGER),
        partners: [
          { id: 'luis', labor: ZERO, shareBps: 3333 },
          { id: 'socio', labor: ZERO, shareBps: 6667 },
        ],
      }),
    );
    expect(output.partners.map((p) => p.total)).toEqual([
      cents(3002099511605173),
      cents(6005099743135818),
    ]);
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
    [-1, 10001],
    [NaN, 5000],
    [Infinity, 5000],
    [10001, -1],
  ])('rechaza participaciones inválidas %s/%s', (first, second) => {
    expectError(
      empty({
        partners: [
          { id: 'luis', labor: ZERO, shareBps: first },
          { id: 'socio', labor: ZERO, shareBps: second },
        ],
      }),
      'INVALID_SHARES',
      /participaciones.*enteros.*entre 0.*10000/i,
    );
  });

  it.each([
    [4000, 5000],
    [0, 0],
    [7000, undefined],
  ])('rechaza participaciones que no suman 10000: %s/%s', (first, second) => {
    expectError(
      empty({
        partners: [
          { id: 'luis', labor: ZERO, shareBps: first },
          { id: 'socio', labor: ZERO, ...(second === undefined ? {} : { shareBps: second }) },
        ],
      }),
      'INVALID_SHARES',
      /participaciones.*sumar 10000/i,
    );
  });

  it.each([-1, 10001, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rechaza reinversión inválida %s',
    (reinvestmentBps) => {
      expectError(
        base({ reinvestmentBps }),
        'INVALID_REINVESTMENT',
        /reinversión.*enteros.*entre 0.*10000/i,
      );
    },
  );

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

  it('rechaza aportaciones de un socio desconocido', () => {
    expectError(
      base({ contributions: [{ partnerId: 'desconocido', amount: ZERO }] }),
      'UNKNOWN_PARTNER',
      /desconocido/i,
    );
  });

  it.each([0.5, 3333.3, Number.MAX_SAFE_INTEGER + 1])(
    'rechaza participación no entera segura %s',
    (shareBps) => {
      expectError(
        empty({
          partners: [
            { id: 'luis', labor: ZERO, shareBps },
            { id: 'socio', labor: ZERO },
          ],
        }),
        'INVALID_SHARES',
        /enteros.*entre 0.*10000/i,
      );
    },
  );

  it('rechaza gastos de un socio desconocido', () => {
    expectError(
      base({ expenses: [expense('1', 'desconocido')] }),
      'UNKNOWN_PARTNER',
      /desconocido/i,
    );
  });

  const amountFields = [
    {
      name: 'aportación',
      input: (amount: Cents) => base({ contributions: [{ partnerId: 'luis', amount }] }),
    },
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
