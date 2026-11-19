import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { PartnerError, validatePartnerSettings } from '@moss/domain';
import type { Partner, UpdatePartners } from '@moss/contracts';
import { DATABASE, type Database } from '../database/database.module.js';
import { partners } from '../database/schema.js';
import { runDomainRule } from '../common/domain-errors.js';

const fields = {
  id: partners.id,
  name: partners.name,
  shareBps: partners.shareBps,
  version: partners.version,
};
@Injectable()
export class PartnersService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  list(): Promise<Partner[]> {
    return this.db.select(fields).from(partners).orderBy(asc(partners.id));
  }
  update(input: UpdatePartners): Promise<Partner[]> {
    return this.db.transaction(async (tx) => {
      const current = await tx
        .select(fields)
        .from(partners)
        .orderBy(asc(partners.id))
        .for('update');
      if (current.length !== 2 || input.partners.some((p) => !current.some((c) => c.id === p.id))) {
        throw new ConflictException({
          code: 'PARTNERS_CHANGED',
          message: 'La lista de socios cambió. Recarga los datos antes de guardar.',
        });
      }
      if (input.partners.some((p) => current.find((c) => c.id === p.id)!.version !== p.version)) {
        throw new ConflictException({
          code: 'PARTNERS_CHANGED',
          message: 'Otro usuario modificó los socios. Recarga los datos y revisa tus cambios.',
        });
      }
      const valid = runDomainRule(PartnerError, () => validatePartnerSettings(input.partners));
      const updated: Partner[] = [];
      for (const p of valid.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
        const [saved] = await tx
          .update(partners)
          .set({ name: p.name, shareBps: p.shareBps, version: sql`${partners.version} + 1` })
          .where(eq(partners.id, p.id))
          .returning(fields);
        updated.push(saved!);
      }
      return updated;
    });
  }
}
