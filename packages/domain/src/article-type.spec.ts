import { describe, expect, it } from 'vitest';
import {
  ArticleTypeError,
  attributeKey,
  createAttributeDefinition,
  updateAttributeDefinition,
  validateArticleTypeName,
  type ArticleTypeErrorCode,
  type AttributeDefinition,
  type ExistingAttribute,
} from './article-type.js';

function expectError(action: () => unknown, code: ArticleTypeErrorCode, message?: string) {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ArticleTypeError);
  expect((caught as ArticleTypeError).code).toBe(code);
  if (message !== undefined) expect((caught as ArticleTypeError).message).toBe(message);
}

const diameter: ExistingAttribute = { id: 'a1', key: 'diametro', name: 'Diámetro' };
const color: ExistingAttribute = { id: 'a2', key: 'color', name: 'Color' };

describe('attributeKey', () => {
  it('genera claves como las del catálogo de ejemplo', () => {
    expect(attributeKey('Diámetro')).toBe('diametro');
    expect(attributeKey('  Tóxica   mascotas ')).toBe('toxica_mascotas');
    expect(attributeKey('Nombre científico')).toBe('nombre_cientifico');
    expect(attributeKey('Uso-recomendado / 2')).toBe('uso_recomendado_2');
    expect(attributeKey('NPK')).toBe('npk');
    expect(attributeKey('Tamaño')).toBe('tamano');
  });

  it('queda vacía si el nombre no tiene letras ni números', () => {
    expect(attributeKey(' ¿? ')).toBe('');
  });
});

describe('validateArticleTypeName', () => {
  it('recorta el nombre', () => {
    expect(validateArticleTypeName('  Maceta ', [])).toBe('Maceta');
  });

  it('rechaza nombres vacíos o demasiado largos', () => {
    expectError(() => validateArticleTypeName('   ', []), 'INVALID_NAME');
    expectError(() => validateArticleTypeName('x'.repeat(61), []), 'INVALID_NAME');
  });

  it('rechaza duplicados sin distinguir mayúsculas, acentos ni espacios', () => {
    const existing = [{ id: 't1', name: 'Fertilizantes y vitaminas' }];
    expectError(
      () => validateArticleTypeName('fertilizantes  y vitamínas', existing),
      'DUPLICATE_NAME',
      'Ya existe el tipo de artículo «Fertilizantes y vitaminas».',
    );
  });

  it('al renombrar, ignora el propio tipo', () => {
    expect(validateArticleTypeName('maceta', [{ id: 't1', name: 'Maceta' }], 't1')).toBe('maceta');
  });
});

describe('createAttributeDefinition', () => {
  it('lista con opciones recortadas y clave generada', () => {
    expect(
      createAttributeDefinition(
        {
          name: ' Forma ',
          dataType: 'list',
          options: [' redonda', 'cuadrada ', 'hexagonal'],
          required: true,
          definesVariant: true,
        },
        [],
      ),
    ).toEqual<AttributeDefinition>({
      key: 'forma',
      name: 'Forma',
      dataType: 'list',
      unit: null,
      options: ['redonda', 'cuadrada', 'hexagonal'],
      required: true,
      definesVariant: true,
    });
  });

  it('número con unidad; unidad vacía queda en null', () => {
    expect(
      createAttributeDefinition(
        {
          name: 'Diámetro',
          dataType: 'number',
          unit: ' cm ',
          required: true,
          definesVariant: true,
        },
        [],
      ),
    ).toMatchObject({ key: 'diametro', unit: 'cm', options: null });
    expect(
      createAttributeDefinition(
        { name: 'Peso', dataType: 'number', unit: '  ', required: false, definesVariant: false },
        [],
      ).unit,
    ).toBeNull();
  });

  it('texto y booleano sin unidad ni opciones', () => {
    for (const dataType of ['text', 'boolean'] as const) {
      expect(
        createAttributeDefinition(
          { name: 'Drenaje', dataType, required: true, definesVariant: false },
          [],
        ),
      ).toMatchObject({ dataType, unit: null, options: null });
    }
  });

  it('rechaza nombres vacíos, demasiado largos o sin clave posible', () => {
    const base = { dataType: 'text', required: false, definesVariant: false } as const;
    expectError(() => createAttributeDefinition({ ...base, name: ' ' }, []), 'INVALID_NAME');
    expectError(
      () => createAttributeDefinition({ ...base, name: 'x'.repeat(61) }, []),
      'INVALID_NAME',
    );
    expectError(() => createAttributeDefinition({ ...base, name: '¿?' }, []), 'INVALID_NAME');
  });

  it('rechaza un nombre repetido en el mismo tipo', () => {
    expectError(
      () =>
        createAttributeDefinition(
          {
            name: 'color',
            dataType: 'list',
            options: ['gris'],
            required: true,
            definesVariant: false,
          },
          [color],
        ),
      'DUPLICATE_NAME',
      'Ya existe el atributo «Color» en este tipo.',
    );
  });

  it('rechaza un nombre distinto cuya clave generada choca con otro atributo', () => {
    expectError(
      () =>
        createAttributeDefinition(
          { name: 'Diametro', dataType: 'number', required: true, definesVariant: false },
          [diameter],
        ),
      'KEY_CONFLICT',
      '«Diametro» genera la clave «diametro», que ya usa el atributo «Diámetro».',
    );
  });

  it('unidad solo en números', () => {
    expectError(
      () =>
        createAttributeDefinition(
          {
            name: 'Material',
            dataType: 'text',
            unit: 'cm',
            required: false,
            definesVariant: false,
          },
          [],
        ),
      'INVALID_UNIT',
    );
    expectError(
      () =>
        createAttributeDefinition(
          {
            name: 'Peso',
            dataType: 'number',
            unit: 'x'.repeat(21),
            required: false,
            definesVariant: false,
          },
          [],
        ),
      'INVALID_UNIT',
    );
  });

  it('opciones solo en listas: al menos una, sin vacías ni repetidas', () => {
    const list = {
      name: 'Color',
      dataType: 'list',
      required: true,
      definesVariant: false,
    } as const;
    expectError(() => createAttributeDefinition({ ...list, options: [] }, []), 'INVALID_OPTIONS');
    expectError(() => createAttributeDefinition(list, []), 'INVALID_OPTIONS');
    expectError(
      () => createAttributeDefinition({ ...list, options: ['gris', '  '] }, []),
      'INVALID_OPTIONS',
    );
    expectError(
      () => createAttributeDefinition({ ...list, options: ['Gris', ' gris'] }, []),
      'INVALID_OPTIONS',
      'La opción «gris» está repetida.',
    );
    expectError(
      () => createAttributeDefinition({ ...list, options: ['x'.repeat(61)] }, []),
      'INVALID_OPTIONS',
    );
    expectError(
      () =>
        createAttributeDefinition(
          {
            name: 'Drenaje',
            dataType: 'boolean',
            options: ['sí'],
            required: true,
            definesVariant: false,
          },
          [],
        ),
      'INVALID_OPTIONS',
    );
  });

  it('un atributo que define variante debe ser requerido', () => {
    expectError(
      () =>
        createAttributeDefinition(
          {
            name: 'Forma',
            dataType: 'list',
            options: ['redonda'],
            required: false,
            definesVariant: true,
          },
          [],
        ),
      'VARIANT_REQUIRES_REQUIRED',
      'Un atributo que define variante debe ser requerido.',
    );
  });
});

describe('updateAttributeDefinition', () => {
  const current: AttributeDefinition = {
    key: 'diametro',
    name: 'Diámetro',
    dataType: 'number',
    unit: 'cm',
    options: null,
    required: true,
    definesVariant: true,
  };

  it('conserva clave y tipo de dato al renombrar', () => {
    expect(
      updateAttributeDefinition(current, { name: 'Diámetro exterior', unit: 'mm' }, [color]),
    ).toEqual({ ...current, name: 'Diámetro exterior', unit: 'mm' });
  });

  it('aplica cambios parciales sobre la definición actual', () => {
    expect(
      updateAttributeDefinition(current, { definesVariant: false, required: false }, []),
    ).toMatchObject({ required: false, definesVariant: false, unit: 'cm' });
  });

  it('valida la combinación resultante', () => {
    expectError(
      () => updateAttributeDefinition(current, { required: false }, []),
      'VARIANT_REQUIRES_REQUIRED',
    );
    expectError(
      () => updateAttributeDefinition(current, { options: ['a'] }, []),
      'INVALID_OPTIONS',
    );
  });

  it('al renombrar detecta duplicados y choques de clave con los demás atributos', () => {
    expectError(
      () => updateAttributeDefinition(current, { name: 'COLOR' }, [color]),
      'DUPLICATE_NAME',
    );
    expectError(
      () =>
        updateAttributeDefinition(
          { ...current, key: 'ancho', name: 'Ancho' },
          { name: 'Diametro' },
          [diameter],
        ),
      'KEY_CONFLICT',
    );
  });
});
