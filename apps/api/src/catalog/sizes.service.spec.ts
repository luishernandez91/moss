import { DrizzleQueryError } from 'drizzle-orm/errors';
import type { Database } from '../database/database.module.js';
import { SizesService } from './sizes.service.js';

describe('SizesService.remove: errores de integridad', () => {
  it.each(['23503', '23001'])('traduce %s solo para la FK de tamaño', async (code) => {
    for (const constraint of [
      'article_variants_size_id_sizes_id_fk',
      'another_foreign_key',
      undefined,
    ]) {
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
        if (constraint === 'article_variants_size_id_sizes_id_fk') {
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
