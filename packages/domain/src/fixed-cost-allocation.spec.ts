import { describe, expect, it } from 'vitest';
import { add, cents, fromPesos, MoneyError, ZERO } from './money.js';
import {
  allocateFixedCosts,
  FixedCostAllocationError,
  type FixedCostAllocationErrorCode,
  type FixedCostAllocationInput,
  type FixedCostLine,
} from './fixed-cost-allocation.js';

const money = fromPesos;

function line(id: string, unitsProduced: number, recipeUnitCost = '0'): FixedCostLine {
  return {
    id,
    unitsProduced,
    recipeCost: cents(money(recipeUnitCost) * unitsProduced),
  };
}

/** Todo cálculo válido redistribuye el total sin crear ni perder centavos. */
function calculate(input: FixedCostAllocationInput) {
  const output = allocateFixedCosts(input);
  expect(add(...output.lines.map((entry) => entry.allocated), output.unallocated)).toBe(
    input.fixedCosts,
  );
  for (const entry of output.lines) {
    if (entry.perUnit === null) {
      expect(entry.unitsProduced).toBe(0);
      expect(entry.allocated).toBe(ZERO);
    } else {
      const { base, unitsWithExtraCent } = entry.perUnit;
      expect(base * entry.unitsProduced + unitsWithExtraCent).toBe(entry.allocated);
      expect(unitsWithExtraCent).toBeGreaterThanOrEqual(0);
      expect(unitsWithExtraCent).toBeLessThan(entry.unitsProduced);
    }
  }
  return output;
}

function expectError(input: FixedCostAllocationInput, code: FixedCostAllocationErrorCode) {
  let caught: unknown;
  try {
    allocateFixedCosts(input);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(FixedCostAllocationError);
  expect((caught as FixedCostAllocationError).code).toBe(code);
  expect((caught as FixedCostAllocationError).message).toMatch(/[a-záéíóúñ]/);
}

describe('allocateFixedCosts', () => {
  it('reparte plaza y gasolina por unidad producida y suma el prorrateo al costo de receta', () => {
    // §1 y pantalla 13: prorrateo por unidad producida; receta de §10: $53.10 la chica.
    const output = calculate({
      fixedCosts: add(money('200'), money('100')),
      lines: [line('nochebuena-chica', 40, '53.10'), line('nochebuena-mediana', 20, '73')],
    });
    expect(output).toEqual({
      lines: [
        {
          id: 'nochebuena-chica',
          unitsProduced: 40,
          allocated: money('200'),
          perUnit: { base: money('5'), unitsWithExtraCent: 0 },
          fixedPerUnit: money('5'),
          recipeUnitCost: money('53.10'),
          realUnitCost: money('58.10'),
        },
        {
          id: 'nochebuena-mediana',
          unitsProduced: 20,
          allocated: money('100'),
          perUnit: { base: money('5'), unitsWithExtraCent: 0 },
          fixedPerUnit: money('5'),
          recipeUnitCost: money('73'),
          realUnitCost: money('78'),
        },
      ],
      unallocated: ZERO,
    });
  });

  it('con una sola línea, toda la carga fija es suya', () => {
    const [only] = calculate({
      fixedCosts: money('300'),
      lines: [line('chica', 60, '53.10')],
    }).lines;
    expect(only!.allocated).toBe(money('300'));
    expect(only!.realUnitCost).toBe(money('58.10'));
  });

  it('dentro de una línea, el residuo se reparte con pesos iguales: ninguna pieza difiere más de 1¢', () => {
    const [only] = calculate({ fixedCosts: money('100'), lines: [line('chica', 3)] }).lines;
    expect(only!.allocated).toBe(money('100'));
    expect(only!.perUnit).toEqual({ base: money('33.33'), unitsWithExtraCent: 1 });
    // Cifra informativa half-up: 3 × $33.33 = $99.99; el centavo restante está en perUnit.
    expect(only!.fixedPerUnit).toBe(money('33.33'));
  });

  it('redondea half-up la cifra por pieza cuando la división no es exacta', () => {
    // $2.00 / 3 = 66.67¢ → 67¢; 5¢ / 2 = 2.5¢ → 3¢.
    const thirds = calculate({ fixedCosts: cents(200), lines: [line('a', 3)] });
    // Truncar daría 66¢; half-up da 67¢. El reparto exacto es 67/67/66.
    expect(thirds.lines[0]!.fixedPerUnit).toBe(cents(67));
    expect(thirds.lines[0]!.perUnit).toEqual({ base: cents(66), unitsWithExtraCent: 2 });

    const halves = calculate({ fixedCosts: cents(5), lines: [line('a', 2)] });
    expect(halves.lines[0]!.fixedPerUnit).toBe(cents(3));
    expect(halves.lines[0]!.perUnit).toEqual({ base: cents(2), unitsWithExtraCent: 1 });
  });

  it('redondea el costo real una sola vez desde los totales, no sumando cifras redondeadas', () => {
    // Receta 100¢ entre 3 (33.33) + fijo 100¢ entre 3 (33.33) = 200¢ / 3 = 66.67 → 67¢.
    const [only] = calculate({
      fixedCosts: cents(100),
      lines: [{ id: 'a', unitsProduced: 3, recipeCost: cents(100) }],
    }).lines;
    expect(only!.recipeUnitCost).toBe(cents(33));
    expect(only!.fixedPerUnit).toBe(cents(33));
    expect(only!.realUnitCost).toBe(cents(67));
  });

  it('el residuo entre líneas va por ID ascendente UTF-16, sin importar el orden de entrada', () => {
    const output = calculate({
      fixedCosts: money('10'),
      lines: [line('b', 2), line('a', 1)],
    });
    expect(output.lines.map((entry) => [entry.id, entry.allocated])).toEqual([
      ['a', money('3.34')],
      ['b', money('6.66')],
    ]);
    // Comparación de cadenas, no localeCompare: «Z» (U+005A) va antes que «a» (U+0061).
    const utf16 = calculate({ fixedCosts: cents(1), lines: [line('a', 1), line('Z', 1)] });
    expect(utf16.lines.map((entry) => [entry.id, entry.allocated])).toEqual([
      ['Z', cents(1)],
      ['a', ZERO],
    ]);
  });

  it('una línea sin unidades no recibe carga ni residuo; las demás absorben todo', () => {
    const output = calculate({
      fixedCosts: cents(301),
      lines: [line('a', 0), line('b', 1), line('c', 1)],
    });
    expect(output.lines).toEqual([
      {
        id: 'a',
        unitsProduced: 0,
        allocated: ZERO,
        perUnit: null,
        fixedPerUnit: null,
        recipeUnitCost: null,
        realUnitCost: null,
      },
      expect.objectContaining({ id: 'b', allocated: cents(151) }),
      expect.objectContaining({ id: 'c', allocated: cents(150) }),
    ]);
    expect(output.unallocated).toBe(ZERO);
  });

  it('sin unidades producidas no hay base: todo queda sin asignar', () => {
    const output = calculate({ fixedCosts: money('300'), lines: [line('a', 0), line('b', 0)] });
    expect(output.unallocated).toBe(money('300'));
    expect(output.lines).toEqual(
      ['a', 'b'].map((id) => ({
        id,
        unitsProduced: 0,
        allocated: ZERO,
        perUnit: null,
        fixedPerUnit: null,
        recipeUnitCost: null,
        realUnitCost: null,
      })),
    );

    expect(calculate({ fixedCosts: money('300'), lines: [] })).toEqual({
      lines: [],
      unallocated: money('300'),
    });
  });

  it('sin costos fijos, el costo real es igual al de receta', () => {
    const output = calculate({ fixedCosts: ZERO, lines: [line('chica', 40, '53.10')] });
    expect(output.lines[0]).toEqual({
      id: 'chica',
      unitsProduced: 40,
      allocated: ZERO,
      perUnit: { base: ZERO, unitsWithExtraCent: 0 },
      fixedPerUnit: ZERO,
      recipeUnitCost: money('53.10'),
      realUnitCost: money('53.10'),
    });
    expect(output.unallocated).toBe(ZERO);
  });

  it('no muta la entrada', () => {
    const lines = [line('b', 2), line('a', 1)];
    const snapshot = structuredClone(lines);
    allocateFixedCosts({ fixedCosts: money('10'), lines });
    expect(lines).toEqual(snapshot);
  });

  it('valida líneas con identificador vacío o duplicado', () => {
    expectError({ fixedCosts: ZERO, lines: [line(' ', 1)] }, 'INVALID_LINES');
    expectError({ fixedCosts: ZERO, lines: [line('a', 1), line('a', 2)] }, 'INVALID_LINES');
  });

  it('valida unidades enteras seguras no negativas', () => {
    for (const units of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expectError(
        { fixedCosts: ZERO, lines: [{ id: 'a', unitsProduced: units, recipeCost: ZERO }] },
        'INVALID_UNITS',
      );
    }
  });

  it('valida montos enteros de centavos no negativos', () => {
    expectError({ fixedCosts: 1.5 as never, lines: [] }, 'INVALID_AMOUNT');
    expectError({ fixedCosts: cents(-1), lines: [] }, 'NEGATIVE_AMOUNT');
    expectError(
      { fixedCosts: ZERO, lines: [{ id: 'a', unitsProduced: 1, recipeCost: 0.5 as never }] },
      'INVALID_AMOUNT',
    );
    expectError(
      { fixedCosts: ZERO, lines: [{ id: 'a', unitsProduced: 1, recipeCost: cents(-1) }] },
      'NEGATIVE_AMOUNT',
    );
  });

  it('rechaza costo de receta sin unidades producidas', () => {
    expectError(
      { fixedCosts: ZERO, lines: [{ id: 'a', unitsProduced: 0, recipeCost: cents(100) }] },
      'INCONSISTENT_RECIPE_COST',
    );
  });

  it('propaga MoneyError si el costo real desborda el entero seguro', () => {
    expect(() =>
      allocateFixedCosts({
        fixedCosts: cents(1),
        lines: [{ id: 'a', unitsProduced: 1, recipeCost: cents(Number.MAX_SAFE_INTEGER) }],
      }),
    ).toThrow(MoneyError);
  });
});
