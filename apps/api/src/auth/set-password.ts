import { assertCanCreatePartner } from '@moss/domain';
import { eq, sql } from 'drizzle-orm';
import { authEmailSchema } from '@moss/contracts';
import type { Database } from '../database/database.module.js';
import { users, partners } from '../database/schema.js';
import { hashPassword } from './password.js';

/** Mismo flujo para CLI y fixtures: creación atómica o cambio con revocación por versión. */
export async function setPassword(
  db: Database,
  emailInput: string,
  password: string,
  name?: string,
): Promise<string> {
  const email = authEmailSchema.parse(emailInput);
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    // Todas las altas usan la misma llave; también protege el caso de cero socios.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(72835101)`);
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
    const [partner] = existing
      ? await tx.select({ id: partners.id }).from(partners).where(eq(partners.userId, existing.id))
      : [];
    if (!partner) {
      const current = await tx.select({ id: partners.id }).from(partners);
      assertCanCreatePartner(current.length);
    }
    const [user] = await tx
      .insert(users)
      .values({ email, passwordHash })
      .onConflictDoUpdate({
        target: users.email,
        set: { passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` },
      })
      .returning({ id: users.id });
    await tx
      .insert(partners)
      .values({ userId: user!.id, name: name?.trim() || email.split('@')[0]! })
      .onConflictDoNothing({ target: partners.userId });
    return user!.id;
  });
}
