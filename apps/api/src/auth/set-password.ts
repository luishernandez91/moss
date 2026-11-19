import { sql } from 'drizzle-orm';
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
