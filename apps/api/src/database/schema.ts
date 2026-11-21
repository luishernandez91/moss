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
// K1 · Campañas (importaciones aparte para no reordenar las existentes).
import { PERSISTED_CAMPAIGN_STATUSES, type CampaignAction } from '@moss/domain';
import { date, foreignKey } from 'drizzle-orm/pg-core';
// C4 · Productos y recetas.
import { RECIPE_CATEGORIES } from '@moss/domain';
import { primaryKey } from 'drizzle-orm/pg-core';

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

// K1 · Campañas: modelo y lista. La restricción de empalme (EXCLUDE) y los tipos sembrados están en
// la migración personalizada `0007_campaigns_overlap`: Drizzle no expresa EXCLUDE.
export const campaignStatus = pgEnum('campaign_status', PERSISTED_CAMPAIGN_STATUSES);
export const campaignEventType = pgEnum('campaign_event_type', [
  'schedule',
  'unschedule',
  'cancel',
  'close',
  'reopen',
] as const satisfies readonly CampaignAction[]);

export const campaignTypes = pgTable(
  'campaign_types',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    /** Evento: sus campañas pueden empalmarse. Temporada: no. Se copia en cada campaña. */
    allowsOverlap: boolean('allows_overlap').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('campaign_types_name_unique').on(sql`lower(${table.name})`),
    // Destino de la FK compuesta de campaigns: mantiene allows_overlap igual al del tipo.
    unique('campaign_types_id_allows_overlap_unique').on(table.id, table.allowsOverlap),
  ],
);

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    campaignTypeId: uuid('campaign_type_id').notNull(),
    /** Copia de campaign_types.allows_overlap (FK compuesta con ON UPDATE CASCADE) para el EXCLUDE. */
    allowsOverlap: boolean('allows_overlap').notNull(),
    budget: integer().notNull(),
    startDate: date('start_date', { mode: 'string' }),
    endDate: date('end_date', { mode: 'string' }),
    status: campaignStatus().notNull().default('draft'),
    /** Porcentaje entero en puntos base (múltiplo de 100), como D7 y §8 regla 7. */
    reinvestmentBps: integer('reinvestment_bps').notNull().default(0),
    notes: text(),
    clonedFromId: uuid('cloned_from_id'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'campaigns_type_allows_overlap_fk',
      columns: [table.campaignTypeId, table.allowsOverlap],
      foreignColumns: [campaignTypes.id, campaignTypes.allowsOverlap],
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      name: 'campaigns_cloned_from_fk',
      columns: [table.clonedFromId],
      foreignColumns: [table.id],
    }),
    index('campaigns_type_idx').on(table.campaignTypeId),
    check('campaigns_budget_non_negative', sql`${table.budget} >= 0`),
    check(
      'campaigns_reinvestment_whole_percent',
      sql`${table.reinvestmentBps} BETWEEN 0 AND 10000 AND ${table.reinvestmentBps} % 100 = 0`,
    ),
    // D4: un borrador no valida fechas; cualquier otro estado tiene ambas con inicio <= fin.
    check(
      'campaigns_dates_unless_draft',
      sql`${table.status} = 'draft' OR (${table.startDate} IS NOT NULL AND ${table.endDate} IS NOT NULL AND ${table.startDate} <= ${table.endDate})`,
    ),
  ],
);

/** Bitácora (§8 regla 11): usuario, fecha y motivo en columnas propias; `payload` lleva el socio. */
export const campaignEvents = pgTable(
  'campaign_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      // Un borrador se puede eliminar (§5) y se lleva su historial; las cerradas nunca se eliminan.
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    type: campaignEventType().notNull(),
    fromStatus: campaignStatus('from_status').notNull(),
    toStatus: campaignStatus('to_status').notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    reason: text(),
    payload: jsonb().$type<{ partnerId: string }>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('campaign_events_campaign_idx').on(table.campaignId, table.createdAt)],
);

// C4 · Productos y recetas. Árbol de hasta 3 niveles y reglas de receta validados en dominio
// (`product-catalog`) bajo el bloqueo de catálogo. Las FK a `sizes` llevan nombre para traducir
// `SIZE_IN_USE` solo con ellas. Sin borrado de productos: se desactivan.
export const recipeComponentCategory = pgEnum('recipe_component_category', RECIPE_CATEGORIES);

export const products = pgTable(
  'products',
  {
    id: uuid().primaryKey().defaultRandom(),
    parentId: uuid('parent_id'),
    name: text().notNull(),
    /** true = hereda la oferta de tamaños; false = lista explícita en `product_sizes`. */
    inheritsSizes: boolean('inherits_sizes').notNull().default(true),
    active: boolean().notNull().default(true),
    version: integer().notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'products_parent_id_fk',
      columns: [table.parentId],
      foreignColumns: [table.id],
    }).onDelete('restrict'),
    uniqueIndex('products_name_unique').on(sql`lower(${table.name})`),
    index('products_parent_idx').on(table.parentId),
    check(
      'products_not_own_parent',
      sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`,
    ),
    check('products_version_nonnegative', sql`${table.version} >= 0`),
  ],
);

/** Oferta explícita de tamaños de un producto (`inherits_sizes = false`). */
export const productSizes = pgTable(
  'product_sizes',
  {
    productId: uuid('product_id').notNull(),
    sizeId: uuid('size_id').notNull(),
  },
  (table) => [
    primaryKey({ name: 'product_sizes_pk', columns: [table.productId, table.sizeId] }),
    foreignKey({
      name: 'product_sizes_product_id_fk',
      columns: [table.productId],
      foreignColumns: [products.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'product_sizes_size_id_fk',
      columns: [table.sizeId],
      foreignColumns: [sizes.id],
    }).onDelete('restrict'),
  ],
);

/** Precio general propio por tamaño (§2); sin fila = sin precio, sin herencia (D3). */
export const productPrices = pgTable(
  'product_prices',
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid('product_id').notNull(),
    sizeId: uuid('size_id').notNull(),
    price: integer().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'product_prices_product_id_fk',
      columns: [table.productId],
      foreignColumns: [products.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'product_prices_size_id_fk',
      columns: [table.sizeId],
      foreignColumns: [sizes.id],
    }).onDelete('restrict'),
    unique('product_prices_product_size_unique').on(table.productId, table.sizeId),
    check('product_prices_price_non_negative', sql`${table.price} >= 0`),
  ],
);

/**
 * Componente de receta con identidad estable; sus cantidades o montos por tamaño están en
 * `recipe_component_values`. De artículo (`article_id`) o de monto fijo (concepto).
 */
export const recipeComponents = pgTable(
  'recipe_components',
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid('product_id').notNull(),
    position: integer().notNull(),
    articleId: uuid('article_id'),
    /** Variante fija; excluye filtro y tamaño de variante. */
    variantId: uuid('variant_id'),
    attributeFilter: jsonb('attribute_filter')
      .$type<Record<string, string | number | boolean>>()
      .notNull()
      .default({}),
    /** `{tamano}`: la variante del tamaño que se produce. */
    variantSizeProduced: boolean('variant_size_produced').notNull().default(false),
    /** Tamaño literal de la variante. */
    variantSizeId: uuid('variant_size_id'),
    concept: text(),
    category: recipeComponentCategory().notNull(),
    replacesComponentId: uuid('replaces_component_id'),
  },
  (table) => [
    foreignKey({
      name: 'recipe_components_product_id_fk',
      columns: [table.productId],
      foreignColumns: [products.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'recipe_components_article_id_fk',
      columns: [table.articleId],
      foreignColumns: [articles.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'recipe_components_variant_id_fk',
      columns: [table.variantId],
      foreignColumns: [articleVariants.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'recipe_components_variant_size_id_fk',
      columns: [table.variantSizeId],
      foreignColumns: [sizes.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'recipe_components_replaces_component_id_fk',
      columns: [table.replacesComponentId],
      foreignColumns: [table.id],
    }).onDelete('restrict'),
    index('recipe_components_product_idx').on(table.productId, table.position),
    index('recipe_components_replaces_idx').on(table.replacesComponentId),
    check(
      'recipe_components_kind',
      sql`(${table.articleId} IS NOT NULL) OR (${table.concept} IS NOT NULL AND ${table.variantId} IS NULL AND ${table.attributeFilter} = '{}'::jsonb AND NOT ${table.variantSizeProduced} AND ${table.variantSizeId} IS NULL)`,
    ),
    check(
      'recipe_components_fixed_variant_alone',
      sql`${table.variantId} IS NULL OR (${table.attributeFilter} = '{}'::jsonb AND NOT ${table.variantSizeProduced} AND ${table.variantSizeId} IS NULL)`,
    ),
    check(
      'recipe_components_one_variant_size',
      sql`NOT (${table.variantSizeProduced} AND ${table.variantSizeId} IS NOT NULL)`,
    ),
    check(
      'recipe_components_not_self_replacing',
      sql`${table.replacesComponentId} IS NULL OR ${table.replacesComponentId} <> ${table.id}`,
    ),
    check('recipe_components_position_nonnegative', sql`${table.position} >= 0`),
  ],
);

/** Cantidad (artículo) o monto en centavos (fijo) de un componente: genérico (`size_id` NULL) o por tamaño. */
export const recipeComponentValues = pgTable(
  'recipe_component_values',
  {
    id: uuid().primaryKey().defaultRandom(),
    componentId: uuid('component_id').notNull(),
    sizeId: uuid('size_id'),
    quantity: numeric({ precision: 12, scale: 4, mode: 'number' }),
    amount: integer(),
  },
  (table) => [
    foreignKey({
      name: 'recipe_component_values_component_id_fk',
      columns: [table.componentId],
      foreignColumns: [recipeComponents.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'recipe_component_values_size_id_fk',
      columns: [table.sizeId],
      foreignColumns: [sizes.id],
    }).onDelete('restrict'),
    unique('recipe_component_values_component_size_unique')
      .on(table.componentId, table.sizeId)
      .nullsNotDistinct(),
    check(
      'recipe_component_values_one_value',
      sql`(${table.quantity} IS NULL) <> (${table.amount} IS NULL)`,
    ),
    check(
      'recipe_component_values_quantity_positive',
      sql`${table.quantity} IS NULL OR ${table.quantity} > 0`,
    ),
    check(
      'recipe_component_values_amount_non_negative',
      sql`${table.amount} IS NULL OR ${table.amount} >= 0`,
    ),
  ],
);
