import { describe, expect, it } from 'vitest';
import {
  articleTypeParamsSchema,
  attributeParamsSchema,
  createArticleTypeSchema,
  createAttributeSchema,
  updateAttributeSchema,
} from './article-types.js';

const uuid = '0a8f8d5e-3c7b-4a35-9b6a-1f7d2d0f5c11';

describe('contratos de tipos de artículo', () => {
  it('recorta el nombre del tipo y exige texto', () => {
    expect(createArticleTypeSchema.parse({ name: '  Maceta ' })).toEqual({
      name: 'Maceta',
      usesSize: false,
    });
    expect(createArticleTypeSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(createArticleTypeSchema.safeParse({ name: 'Maceta', extra: 1 }).success).toBe(false);
  });

  it('el atributo es una unión por tipo de dato: opciones solo en lista, unidad solo en número', () => {
    const base = { name: 'Color', required: true, definesVariant: false };
    expect(
      createAttributeSchema.parse({ ...base, dataType: 'list', options: ['gris', 'blanco'] }),
    ).toEqual({ ...base, dataType: 'list', options: ['gris', 'blanco'] });
    expect(createAttributeSchema.safeParse({ ...base, dataType: 'list' }).success).toBe(false);
    expect(
      createAttributeSchema.safeParse({ ...base, dataType: 'text', options: ['a'] }).success,
    ).toBe(false);
    expect(createAttributeSchema.parse({ ...base, dataType: 'number', unit: 'cm' })).toMatchObject({
      unit: 'cm',
    });
    expect(
      createAttributeSchema.safeParse({ ...base, dataType: 'boolean', unit: 'cm' }).success,
    ).toBe(false);
    expect(createAttributeSchema.safeParse({ ...base, dataType: 'fecha' }).success).toBe(false);
  });

  // C2: la clave llega al dominio, que responde 422 KEY_IMMUTABLE si cambia (antes era 400).
  it('el parche no permite cambiar el tipo de dato y no puede ir vacío', () => {
    expect(updateAttributeSchema.parse({ active: false })).toEqual({ active: false });
    expect(updateAttributeSchema.safeParse({}).success).toBe(false);
    expect(updateAttributeSchema.safeParse({ dataType: 'text' }).success).toBe(false);
    expect(updateAttributeSchema.parse({ unit: null })).toEqual({ unit: null });
  });

  it('valida los identificadores de ruta como UUID', () => {
    expect(articleTypeParamsSchema.safeParse({ id: uuid }).success).toBe(true);
    expect(articleTypeParamsSchema.safeParse({ id: 'maceta' }).success).toBe(false);
    expect(attributeParamsSchema.safeParse({ id: uuid, attributeId: 'x' }).success).toBe(false);
  });
});
