import { describe, expect, it } from 'vitest';
import { createSizeSchema, updateSizeSchema, reorderSizesSchema } from './sizes.js';
import { createArticleTypeSchema, updateArticleTypeSchema } from './article-types.js';
import { createVariantSchema, updateVariantSchema, articleListQuerySchema } from './articles.js';
const id = '00000000-0000-4000-8000-000000000001';
describe('contratos C3', () => {
  it('alta y edición de tamaño rechazan campos extra y órdenes inválidos', () => {
    expect(createSizeSchema.parse({ key: 'small', label: ' Chico ' })).toMatchObject({
      label: 'Chico',
    });
    expect(
      createSizeSchema.safeParse({ key: 'small', label: 'Chico', sortOrder: -1 }).success,
    ).toBe(false);
    expect(updateSizeSchema.safeParse({ active: false }).success).toBe(true);
    expect(updateSizeSchema.safeParse({}).success).toBe(false);
    expect(reorderSizesSchema.safeParse({ ids: [id] }).success).toBe(true);
    expect(reorderSizesSchema.safeParse({ ids: ['bad'] }).success).toBe(false);
  });
  it('usesSize es booleano y al editar no se inventa un valor omitido', () => {
    expect(createArticleTypeSchema.parse({ name: 'Planta', usesSize: true }).usesSize).toBe(true);
    expect(createArticleTypeSchema.parse({ name: 'Maceta' }).usesSize).toBe(false);
    expect(updateArticleTypeSchema.parse({ name: 'Otro' }).usesSize).toBeUndefined();
    expect(updateArticleTypeSchema.parse({ usesSize: true })).toEqual({ usesSize: true });
    expect(updateArticleTypeSchema.safeParse({}).success).toBe(false);
    expect(createArticleTypeSchema.safeParse({ name: 'Planta', usesSize: 'true' }).success).toBe(
      false,
    );
  });
  it('sizeId acepta UUID o null; la relación con el tipo pertenece al dominio', () => {
    const v = { sku: 'S', averageCost: 0, price: null, stock: 0 };
    expect(createVariantSchema.parse({ ...v, sizeId: id }).sizeId).toBe(id);
    expect(createVariantSchema.parse(v).sizeId).toBeNull();
    expect(updateVariantSchema.parse({ sizeId: null })).toEqual({ sizeId: null });
    expect(updateVariantSchema.safeParse({ sizeId: 'small' }).success).toBe(false);
    expect(articleListQuerySchema.parse({ sizeId: id, inStock: 'true' })).toMatchObject({
      sizeId: id,
      inStock: true,
    });
  });
});
