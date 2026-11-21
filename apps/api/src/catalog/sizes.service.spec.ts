import { DrizzleQueryError } from 'drizzle-orm/errors';
import type { Database } from '../database/database.module.js';
import { SIZE_REFERENCE_CONSTRAINTS, SizesService } from './sizes.service.js';

describe('SizesService.remove: errores de integridad', () => {
  it.each(['23503', '23001'])('traduce %s solo para las FK de tamaño (C3 y C4)', async (code) => {
    expect(SIZE_REFERENCE_CONSTRAINTS).toEqual([
      'article_variants_size_id_sizes_id_fk',
      'product_sizes_size_id_fk',
      'product_prices_size_id_fk',
      'recipe_component_values_size_id_fk',
      'recipe_components_variant_size_id_fk',
    ]);
    for (const constraint of [...SIZE_REFERENCE_CONSTRAINTS, 'another_foreign_key', undefined]) {
      const error = new DrizzleQueryError(
        'delete',
        [],
        Object.assign(new Error('pg'), { code, constraint }),
      );
      const tx = {
        execute: vi.fn().mockResolvedValue(undefined),
        delete: () => ({ where: () => Promise.reject(error) }),
      };
      const db = {
        transaction: (action: (transaction: typeof tx) => Promise<void>) => action(tx),
      } as unknown as Database;
      const listing = vi
        .spyOn(SizesService.prototype, 'list')
        .mockResolvedValue([
          { id: 'size-id', key: 'small', label: 'Chico', active: true, sortOrder: 0, inUse: false },
        ]);
      try {
        const removal = new SizesService(db).remove('size-id');
        if ((SIZE_REFERENCE_CONSTRAINTS as readonly (string | undefined)[]).includes(constraint)) {
          await expect(removal).rejects.toMatchObject({
            status: 409,
            response: { code: 'SIZE_IN_USE' },
          });
        } else {
          await expect(removal).rejects.toBe(error);
        }
      } finally {
        listing.mockRestore();
      }
    }
  });
});
