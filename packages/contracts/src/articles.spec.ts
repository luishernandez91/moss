import { describe, expect, it } from 'vitest';
import {
  articleListQuerySchema,
  attributeFilterValueSchema,
  buildAttributesSchema,
  createArticleSchema,
  updateArticleSchema,
  updateVariantSchema,
  type AttributeDefinitionForValues,
} from './articles.js';
import { updateAttributeSchema } from './article-types.js';

const definitions: AttributeDefinitionForValues[] = [
  {
    key: 'material',
    name: 'Material',
    dataType: 'list',
    options: ['concreto', 'barro'],
    required: true,
    definesVariant: false,
    active: true,
  },
  {
    key: 'drenaje',
    name: 'Drenaje',
    dataType: 'boolean',
    options: null,
    required: true,
    definesVariant: false,
    active: true,
  },
  {
    key: 'notas',
    name: 'Notas',
    dataType: 'text',
    options: null,
    required: false,
    definesVariant: false,
    active: true,
  },
  {
    key: 'antiguo',
    name: 'Antiguo',
    dataType: 'text',
    options: null,
    required: true,
    definesVariant: false,
    active: false,
  },
  {
    key: 'forma',
    name: 'Forma',
    dataType: 'list',
    options: ['redonda', 'cuadrada'],
    required: true,
    definesVariant: true,
    active: true,
  },
  {
    key: 'diametro',
    name: 'Diámetro',
    dataType: 'number',
    options: null,
    required: true,
    definesVariant: true,
    active: true,
  },
];
const uuid = '0a8f8d5e-3c7b-4a35-9b6a-1f7d2d0f5c11';

describe('buildAttributesSchema', () => {
  const fixed = buildAttributesSchema(definitions, 'fixed');
  const variant = buildAttributesSchema(definitions, 'variant');

  it('valida atributos fijos por tipo de dato y recorta textos', () => {
    expect(fixed.parse({ material: 'barro', drenaje: true, notas: '  a mano ' })).toEqual({
      material: 'barro',
      drenaje: true,
      notas: 'a mano',
    });
  });

  it('exige los requeridos y permite omitir los opcionales', () => {
    expect(fixed.safeParse({ material: 'barro', drenaje: false }).success).toBe(true);
    const missing = fixed.safeParse({ material: 'barro' });
    expect(missing.success).toBe(false);
    expect(missing.error!.issues.map((issue) => issue.path.join('.'))).toEqual(['drenaje']);
  });

  it('rechaza valores fuera de las opciones, del tipo equivocado o vacíos', () => {
    expect(fixed.safeParse({ material: 'plástico', drenaje: true }).success).toBe(false);
    expect(fixed.safeParse({ material: 'barro', drenaje: 'sí' }).success).toBe(false);
    expect(fixed.safeParse({ material: 'barro', drenaje: true, notas: '   ' }).success).toBe(false);
  });

  it('los atributos inactivos son opcionales pero se aceptan sus valores guardados', () => {
    expect(fixed.safeParse({ material: 'barro', drenaje: true, antiguo: 'x' }).success).toBe(true);
  });

  it('rechaza claves desconocidas y atributos del otro alcance', () => {
    expect(fixed.safeParse({ material: 'barro', drenaje: true, forma: 'redonda' }).success).toBe(
      false,
    );
    expect(variant.safeParse({ forma: 'redonda', diametro: 8, material: 'barro' }).success).toBe(
      false,
    );
  });

  it('las variantes exigen valor en todos los atributos que definen variante', () => {
    expect(variant.parse({ forma: 'redonda', diametro: 8 })).toEqual({
      forma: 'redonda',
      diametro: 8,
    });
    expect(variant.safeParse({ forma: 'redonda' }).success).toBe(false);
    expect(variant.safeParse({ forma: 'redonda', diametro: Number.NaN }).success).toBe(false);
  });

  it('un tipo sin atributos de variante solo acepta la combinación vacía', () => {
    const none = buildAttributesSchema(
      definitions.filter((d) => !d.definesVariant),
      'variant',
    );
    expect(none.parse({})).toEqual({});
    expect(none.safeParse({ forma: 'redonda' }).success).toBe(false);
  });
});

describe('contratos de artículo y variante', () => {
  const variantInput = {
    sku: ' mac-1 ',
    attributes: { forma: 'redonda' },
    averageCost: 1500,
    price: null,
    stock: 0.5,
  };

  it('crear exige al menos una variante, unidad de existencia y montos en centavos no negativos', () => {
    const base = {
      articleTypeId: uuid,
      name: ' Maceta de concreto ',
      stockUnit: 'piece',
      sold: true,
      usedInRecipes: true,
      fixedAttributes: { material: 'concreto' },
      variants: [variantInput],
    };
    expect(createArticleSchema.parse(base)).toMatchObject({
      name: 'Maceta de concreto',
      description: null,
    });
    expect(createArticleSchema.safeParse({ ...base, variants: [] }).success).toBe(false);
    expect(createArticleSchema.safeParse({ ...base, stockUnit: 'pieza' }).success).toBe(false);
    for (const averageCost of [-1, 1.5]) {
      expect(
        createArticleSchema.safeParse({ ...base, variants: [{ ...variantInput, averageCost }] })
          .success,
      ).toBe(false);
    }
    expect(
      createArticleSchema.safeParse({ ...base, variants: [{ ...variantInput, stock: -1 }] })
        .success,
    ).toBe(false);
  });

  it('la unidad de existencia y el tipo no se editan; los parches no van vacíos', () => {
    expect(updateArticleSchema.parse({ active: false })).toEqual({ active: false });
    expect(updateArticleSchema.safeParse({}).success).toBe(false);
    expect(updateArticleSchema.safeParse({ stockUnit: 'm' }).success).toBe(false);
    expect(updateArticleSchema.safeParse({ articleTypeId: uuid }).success).toBe(false);
    expect(updateVariantSchema.parse({ averageCost: 1800 })).toEqual({ averageCost: 1800 });
    expect(updateVariantSchema.safeParse({}).success).toBe(false);
  });

  it('el parche de atributo acepta la clave para que el dominio responda 422 si cambia', () => {
    expect(updateAttributeSchema.parse({ key: 'diametro' })).toEqual({ key: 'diametro' });
  });
});

describe('filtros de la lista', () => {
  it('separa cada filtro de atributo en el primer «:» para que el valor pueda contener «:»', () => {
    expect(
      articleListQuerySchema.parse({
        typeId: uuid,
        attr: ['diametro:10', 'hora:10:30'],
        inStock: 'true',
      }),
    ).toEqual({
      typeId: uuid,
      inStock: true,
      includeInactive: false,
      attr: [
        { key: 'diametro', value: '10' },
        { key: 'hora', value: '10:30' },
      ],
    });
    expect(articleListQuerySchema.parse({ attr: 'color:gris', typeId: uuid }).attr).toEqual([
      { key: 'color', value: 'gris' },
    ]);
  });

  it('rechaza filtros sin «:» o sin clave, y filtros de atributo sin tipo', () => {
    expect(articleListQuerySchema.safeParse({ typeId: uuid, attr: 'diametro' }).success).toBe(
      false,
    );
    expect(articleListQuerySchema.safeParse({ typeId: uuid, attr: ':10' }).success).toBe(false);
    expect(articleListQuerySchema.safeParse({ attr: 'diametro:10' }).success).toBe(false);
  });

  it('convierte el valor del filtro según la definición', () => {
    const [, drenaje, , , forma, diametro] = definitions;
    expect(attributeFilterValueSchema(diametro!).parse('10')).toBe(10);
    expect(attributeFilterValueSchema(diametro!).safeParse('diez').success).toBe(false);
    expect(attributeFilterValueSchema(drenaje!).parse('false')).toBe(false);
    expect(attributeFilterValueSchema(drenaje!).safeParse('sí').success).toBe(false);
    expect(attributeFilterValueSchema(forma!).parse('redonda')).toBe('redonda');
    expect(attributeFilterValueSchema(forma!).safeParse('ovalada').success).toBe(false);
  });
});
