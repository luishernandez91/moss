/**
 * Esquema de Drizzle. Las tablas se agregan historia por historia (ver backlog.md).
 * Nombres en inglés según el glosario de AGENTS.md; montos en centavos enteros.
 */
import { ATTRIBUTE_DATA_TYPES } from '@moss/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

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

// C1 · Tipos de artículo y atributos. Los valores de atributo (JSONB) llegan con C2.
export const attributeDataType = pgEnum('attribute_data_type', ATTRIBUTE_DATA_TYPES);

export const articleTypes = pgTable(
  'article_types',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('article_types_name_unique').on(sql`lower(${table.name})`)],
);

export const attributes = pgTable(
  'attributes',
  {
    id: uuid().primaryKey().defaultRandom(),
    articleTypeId: uuid('article_type_id')
      .notNull()
      .references(() => articleTypes.id, { onDelete: 'cascade' }),
    /** Clave de los valores en JSONB; se genera del nombre al crear y no cambia. */
    key: text().notNull(),
    name: text().notNull(),
    dataType: attributeDataType('data_type').notNull(),
    unit: text(),
    options: jsonb().$type<string[]>(),
    required: boolean().notNull(),
    definesVariant: boolean('defines_variant').notNull(),
    active: boolean().notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('attributes_type_key_unique').on(table.articleTypeId, table.key),
    uniqueIndex('attributes_type_name_unique').on(table.articleTypeId, sql`lower(${table.name})`),
    check(
      'attributes_unit_only_number',
      sql`${table.unit} IS NULL OR ${table.dataType} = 'number'`,
    ),
    check(
      'attributes_options_only_list',
      sql`(${table.dataType} = 'list') = (${table.options} IS NOT NULL)`,
    ),
    check(
      'attributes_variant_requires_required',
      sql`NOT ${table.definesVariant} OR ${table.required}`,
    ),
  ],
);
