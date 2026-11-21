/**
 * Esquema de Drizzle. Las tablas se agregan historia por historia (ver backlog.md).
 * Nombres en inglés según el glosario de AGENTS.md; montos en centavos enteros.
 */
import { ATTRIBUTE_DATA_TYPES, DEFAULT_PARTNER_SHARE_BPS, STOCK_UNITS } from '@moss/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  sessionVersion: integer('session_version').notNull().default(0),
});

export const partners = pgTable(
  'partners',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    shareBps: integer('share_bps').notNull().default(DEFAULT_PARTNER_SHARE_BPS),
    version: integer('version').notNull().default(0),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id),
  },
  (table) => [
    check('partners_share_bps_range', sql`${table.shareBps} BETWEEN 0 AND 10000`),
    check('partners_share_bps_whole_percent', sql`${table.shareBps} % 100 = 0`),
    check('partners_version_nonnegative', sql`${table.version} >= 0`),
  ],
);

// C1 · Tipos de artículo y atributos. Los valores de atributo (JSONB) llegan con C2.
export const attributeDataType = pgEnum('attribute_data_type', ATTRIBUTE_DATA_TYPES);

export const sizes = pgTable(
  'sizes',
  {
    id: uuid().primaryKey().defaultRandom(),
    key: text().notNull().unique(),
    label: text().notNull(),
    sortOrder: integer('sort_order').notNull(),
    active: boolean().notNull().default(true),
  },
  (table) => [check('sizes_order_nonnegative', sql`${table.sortOrder} >= 0`)],
);

export const articleTypes = pgTable(
  'article_types',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    usesSize: boolean('uses_size').notNull().default(false),
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

// C2 · Artículos y variantes. Sin borrado: se desactivan (`active`).
export const stockUnit = pgEnum('stock_unit', STOCK_UNITS);
export const costChangeReason = pgEnum('cost_change_reason', ['initial', 'manual']);

export const articles = pgTable(
  'articles',
  {
    id: uuid().primaryKey().defaultRandom(),
    articleTypeId: uuid('article_type_id')
      .notNull()
      .references(() => articleTypes.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    description: text(),
    /** Unidad de la existencia y del costo promedio de todas sus variantes. */
    stockUnit: stockUnit('stock_unit').notNull(),
    fixedAttributes: jsonb('fixed_attributes')
      .$type<Record<string, string | number | boolean>>()
      .notNull()
      .default({}),
    sold: boolean().notNull(),
    usedInRecipes: boolean('used_in_recipes').notNull(),
    active: boolean().notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('articles_type_idx').on(table.articleTypeId),
    index('articles_fixed_attributes_idx').using(
      'gin',
      sql`${table.fixedAttributes} jsonb_path_ops`,
    ),
    check('articles_sold_or_recipes', sql`${table.sold} OR ${table.usedInRecipes}`),
  ],
);

export const articleVariants = pgTable(
  'article_variants',
  {
    id: uuid().primaryKey().defaultRandom(),
    articleId: uuid('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'restrict' }),
    sizeId: uuid('size_id').references(() => sizes.id, { onDelete: 'restrict' }),
    /** Normalizado en mayúsculas por el dominio; único en todo el catálogo, activo o no. */
    sku: text().notNull().unique(),
    attributes: jsonb().$type<Record<string, string | number | boolean>>().notNull().default({}),
    averageCost: integer('average_cost').notNull(),
    price: integer(),
    stock: numeric({ precision: 12, scale: 3, mode: 'number' }).notNull().default(0),
    active: boolean().notNull().default(true),
    // clock_timestamp: varias variantes creadas en una transacción conservan su orden.
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    unique('article_variants_combination_unique')
      .on(table.articleId, table.sizeId, table.attributes)
      .nullsNotDistinct(),
    index('article_variants_attributes_idx').using('gin', sql`${table.attributes} jsonb_path_ops`),
    check('article_variants_cost_non_negative', sql`${table.averageCost} >= 0`),
    check(
      'article_variants_price_non_negative',
      sql`${table.price} IS NULL OR ${table.price} >= 0`,
    ),
    check('article_variants_stock_non_negative', sql`${table.stock} >= 0`),
  ],
);

/** Historial del costo promedio por variante. K4 y F2.1 agregarán motivos de compra. */
export const variantCostChanges = pgTable(
  'variant_cost_changes',
  {
    id: uuid().primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => articleVariants.id, { onDelete: 'restrict' }),
    previousCost: integer('previous_cost'),
    averageCost: integer('average_cost').notNull(),
    reason: costChangeReason().notNull(),
    changedByPartnerId: uuid('changed_by_partner_id').references(() => partners.id, {
      onDelete: 'set null',
    }),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('variant_cost_changes_variant_idx').on(table.variantId, table.changedAt)],
);
