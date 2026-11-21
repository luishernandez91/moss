import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, or, sql } from 'drizzle-orm';
import { SizeError, assertSizeDeletion, validateSize, validateSizeOrder } from '@moss/domain';
import type { CreateSize, Size, UpdateSize } from '@moss/contracts';
import { DATABASE, type Database } from '../database/database.module.js';
import { sizes } from '../database/schema.js';
import { guardWrite, runDomainRule } from '../common/domain-errors.js';
import { catalogWrite } from './catalog-write.js';
const inUse = sql<boolean>`EXISTS (SELECT 1 FROM article_variants v WHERE v.size_id = "sizes"."id")`;
const missing = () =>
  new NotFoundException({ code: 'SIZE_NOT_FOUND', message: 'No se encontró el tamaño.' });
@Injectable()
export class SizesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  list(purpose: 'manage' | 'filter' = 'manage'): Promise<Size[]> {
    return this.db
      .select({
        id: sizes.id,
        key: sizes.key,
        label: sizes.label,
        sortOrder: sizes.sortOrder,
        active: sizes.active,
        inUse,
      })
      .from(sizes)
      .where(purpose === 'filter' ? or(eq(sizes.active, true), inUse) : undefined)
      .orderBy(asc(sizes.sortOrder), asc(sizes.id));
  }
  create(input: CreateSize) {
    return catalogWrite(this.db, async (tx) => {
      const existing = await new SizesService(tx).list();
      const definition = runDomainRule(SizeError, () => validateSize(input, existing));
      const [created] = await tx
        .insert(sizes)
        .values({ ...definition, sortOrder: Math.max(-1, ...existing.map((s) => s.sortOrder)) + 1 })
        .returning();
      return { ...created!, inUse: false };
    });
  }
  update(id: string, patch: UpdateSize) {
    return catalogWrite(this.db, async (tx) => {
      const existing = await new SizesService(tx).list();
      const current = existing.find((s) => s.id === id);
      if (!current) throw missing();
      const definition = runDomainRule(SizeError, () =>
        validateSize({ ...current, ...patch }, existing, current),
      );
      const [updated] = await tx.update(sizes).set(definition).where(eq(sizes.id, id)).returning();
      return { ...updated!, inUse: current.inUse };
    });
  }
  async remove(id: string): Promise<void> {
    await catalogWrite(this.db, async (tx) => {
      const current = (await new SizesService(tx).list()).find((s) => s.id === id);
      if (!current) throw missing();
      runDomainRule(SizeError, () => assertSizeDeletion(current.inUse ? 1 : 0), 409);
      await guardWrite(() => tx.delete(sizes).where(eq(sizes.id, id)), {
        foreignKey: () =>
          new ConflictException({
            code: 'SIZE_IN_USE',
            message: 'El tamaño está en uso; puedes desactivarlo, pero no borrarlo.',
          }),
      });
    });
  }
  order(ids: string[]) {
    return catalogWrite(this.db, async (tx) => {
      const service = new SizesService(tx);
      const existing = await service.list();
      runDomainRule(
        SizeError,
        () =>
          validateSizeOrder(
            ids,
            existing.map((s) => s.id),
          ),
        409,
      );
      for (const [sortOrder, id] of ids.entries())
        await tx.update(sizes).set({ sortOrder }).where(eq(sizes.id, id));
      return service.list();
    });
  }
}
