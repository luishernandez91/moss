/**
 * Esquema de Drizzle. Las tablas se agregan historia por historia (ver backlog.md).
 * Nombres en inglés según el glosario de AGENTS.md; montos en centavos enteros.
 */
import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  sessionVersion: integer('session_version').notNull().default(0),
});

export const partners = pgTable('partners', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id),
});
