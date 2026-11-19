import { describe, expect, it } from 'vitest';
import type { AttributeDefinition } from './article-type.js';
import {
  AttributeUsageError,
  assessAttributeChange,
  assessAttributeDeletion,
  assessNewAttribute,
  assessTypeDeletion,
  type AttributeUsage,
  type AttributeUsageErrorCode,
} from './attribute-usage.js';

function expectError(action: () => unknown, code: AttributeUsageErrorCode, message?: string) {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AttributeUsageError);
  expect((caught as AttributeUsageError).code).toBe(code);
  if (message !== undefined) expect((caught as AttributeUsageError).message).toBe(message);
}

const color: AttributeDefinition = {
  key: 'color',
  name: 'Color',
  dataType: 'list',
  unit: null,
  options: ['gris', 'blanco', 'negro'],
  required: true,
  definesVariant: true,
};
const diameter: AttributeDefinition = {
  key: 'diametro',
  name: 'Diámetro',
  dataType: 'number',
  unit: 'cm',
  options: null,
  required: true,
  definesVariant: true,
};
const material: AttributeDefinition = {
  key: 'material',
  name: 'Material',
  dataType: 'list',
  unit: null,
  options: ['concreto', 'barro'],
  required: false,
  definesVariant: false,
};

const unused: AttributeUsage = {
  valueCount: 0,
  optionsInUse: [],
  missingCount: 0,
  typeArticleCount: 0,
  typeVariantCount: 0,
};
const used = (overrides: Partial<AttributeUsage> = {}): AttributeUsage => ({
  valueCount: 3,
  optionsInUse: ['gris'],
  missingCount: 0,
  typeArticleCount: 2,
  typeVariantCount: 3,
  ...overrides,
});

describe('assessAttributeDeletion', () => {
  it('permite borrar un atributo sin valores y bloquea uno en uso', () => {
    expect(() => assessAttributeDeletion(color, unused)).not.toThrow();
    expectError(
      () => assessAttributeDeletion(color, used()),
      'ATTRIBUTE_IN_USE',
      '«Color» tiene valores en 3 registros; desactívalo en lugar de borrarlo.',
    );
  });
});

describe('assessAttributeChange', () => {
  it('permite renombrar, agregar opciones y activar o desactivar aunque esté en uso', () => {
    expect(() =>
      assessAttributeChange(color, { ...color, name: 'Color base' }, used()),
    ).not.toThrow();
    expect(() =>
      assessAttributeChange(color, { ...color, options: [...color.options!, 'terracota'] }, used()),
    ).not.toThrow();
  });

  it('bloquea quitar una opción en uso y permite quitar una sin valores', () => {
    expectError(
      () => assessAttributeChange(color, { ...color, options: ['blanco', 'negro'] }, used()),
      'ATTRIBUTE_IN_USE',
      'No se pueden quitar opciones con valores guardados: gris.',
    );
    expect(() =>
      assessAttributeChange(color, { ...color, options: ['gris', 'blanco'] }, used()),
    ).not.toThrow();
  });

  it('renombrar una opción en uso equivale a quitarla', () => {
    expectError(
      () =>
        assessAttributeChange(
          color,
          { ...color, options: ['Gris claro', 'blanco', 'negro'] },
          used(),
        ),
      'ATTRIBUTE_IN_USE',
    );
    // Solo cambiar mayúsculas o espacios no es renombrar.
    expect(() =>
      assessAttributeChange(color, { ...color, options: ['Gris', 'blanco', 'negro'] }, used()),
    ).not.toThrow();
  });

  it('bloquea cambiar la unidad de un número en uso', () => {
    expectError(
      () => assessAttributeChange(diameter, { ...diameter, unit: 'mm' }, used()),
      'ATTRIBUTE_IN_USE',
      'No se puede cambiar la unidad de «Diámetro»: cambiaría el significado de 3 valores guardados.',
    );
    expect(() =>
      assessAttributeChange(diameter, { ...diameter, unit: 'mm' }, unused),
    ).not.toThrow();
  });

  it('bloquea cambiar «define variante» en un atributo en uso', () => {
    expectError(
      () => assessAttributeChange(color, { ...color, definesVariant: false }, used()),
      'ATTRIBUTE_IN_USE',
    );
    expectError(
      () =>
        assessAttributeChange(
          material,
          { ...material, required: true, definesVariant: true },
          used({ optionsInUse: ['barro'] }),
        ),
      'ATTRIBUTE_IN_USE',
    );
  });

  it('marcar «define variante» sin uso exige valor en todas las variantes del tipo', () => {
    expectError(
      () =>
        assessAttributeChange(
          material,
          { ...material, required: true, definesVariant: true },
          { ...unused, typeArticleCount: 2, typeVariantCount: 5 },
        ),
      'ATTRIBUTE_VALUES_MISSING',
      '«Material» pasaría a definir variante y faltaría su valor en 5 variantes.',
    );
    expect(() =>
      assessAttributeChange(
        material,
        { ...material, required: true, definesVariant: true },
        unused,
      ),
    ).not.toThrow();
  });

  it('marcar «requerido» exige que no falten valores', () => {
    expectError(
      () =>
        assessAttributeChange(material, { ...material, required: true }, used({ missingCount: 2 })),
      'ATTRIBUTE_VALUES_MISSING',
      '«Material» no tiene valor en 2 registros; llénalos antes de marcarlo como requerido.',
    );
    expect(() =>
      assessAttributeChange(material, { ...material, required: true }, used({ missingCount: 0 })),
    ).not.toThrow();
  });

  it('el tipo de dato no cambia nunca (C1 lo rechaza antes) y cualquier intento falla', () => {
    expect(() =>
      assessAttributeChange(material, { ...material, dataType: 'text', options: null }, unused),
    ).toThrow(AttributeUsageError);
  });
});

describe('assessNewAttribute', () => {
  it('un atributo opcional se puede crear aunque el tipo tenga artículos', () => {
    expect(() => assessNewAttribute(material, { ...unused, typeArticleCount: 4 })).not.toThrow();
  });

  it('un atributo fijo requerido en un tipo con artículos bloquea con el conteo de artículos', () => {
    expectError(
      () => assessNewAttribute({ ...material, required: true }, { ...unused, typeArticleCount: 4 }),
      'ATTRIBUTE_VALUES_MISSING',
      '«Material» sería requerido y faltaría su valor en 4 artículos. Créalo opcional, llena los valores y luego márcalo como requerido.',
    );
  });

  it('un atributo de variante nuevo en un tipo con variantes bloquea con el conteo de variantes', () => {
    expectError(
      () => assessNewAttribute(color, { ...unused, typeArticleCount: 1, typeVariantCount: 3 }),
      'ATTRIBUTE_VALUES_MISSING',
      '«Color» definiría variante y faltaría su valor en 3 variantes.',
    );
    expect(() => assessNewAttribute(color, unused)).not.toThrow();
  });
});

describe('assessTypeDeletion', () => {
  it('bloquea borrar un tipo con artículos, activos o no', () => {
    expect(() => assessTypeDeletion('Maceta', 0)).not.toThrow();
    expectError(
      () => assessTypeDeletion('Maceta', 3),
      'ARTICLE_TYPE_IN_USE',
      'El tipo «Maceta» tiene 3 artículos; no se puede borrar.',
    );
  });
});
