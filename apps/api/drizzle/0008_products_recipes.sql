CREATE TYPE "public"."recipe_component_category" AS ENUM('material', 'labor');--> statement-breakpoint
CREATE TABLE "product_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"size_id" uuid NOT NULL,
	"price" integer NOT NULL,
	CONSTRAINT "product_prices_product_size_unique" UNIQUE("product_id","size_id"),
	CONSTRAINT "product_prices_price_non_negative" CHECK ("product_prices"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_sizes" (
	"product_id" uuid NOT NULL,
	"size_id" uuid NOT NULL,
	CONSTRAINT "product_sizes_pk" PRIMARY KEY("product_id","size_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"inherits_sizes" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_not_own_parent" CHECK ("products"."parent_id" IS NULL OR "products"."parent_id" <> "products"."id"),
	CONSTRAINT "products_version_nonnegative" CHECK ("products"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_component_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_id" uuid NOT NULL,
	"size_id" uuid,
	"quantity" numeric(12, 4),
	"amount" integer,
	CONSTRAINT "recipe_component_values_component_size_unique" UNIQUE NULLS NOT DISTINCT("component_id","size_id"),
	CONSTRAINT "recipe_component_values_one_value" CHECK (("recipe_component_values"."quantity" IS NULL) <> ("recipe_component_values"."amount" IS NULL)),
	CONSTRAINT "recipe_component_values_quantity_positive" CHECK ("recipe_component_values"."quantity" IS NULL OR "recipe_component_values"."quantity" > 0),
	CONSTRAINT "recipe_component_values_amount_non_negative" CHECK ("recipe_component_values"."amount" IS NULL OR "recipe_component_values"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"article_id" uuid,
	"variant_id" uuid,
	"attribute_filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"variant_size_produced" boolean DEFAULT false NOT NULL,
	"variant_size_id" uuid,
	"concept" text,
	"category" "recipe_component_category" NOT NULL,
	"replaces_component_id" uuid,
	CONSTRAINT "recipe_components_kind" CHECK (("recipe_components"."article_id" IS NOT NULL) OR ("recipe_components"."concept" IS NOT NULL AND "recipe_components"."variant_id" IS NULL AND "recipe_components"."attribute_filter" = '{}'::jsonb AND NOT "recipe_components"."variant_size_produced" AND "recipe_components"."variant_size_id" IS NULL)),
	CONSTRAINT "recipe_components_fixed_variant_alone" CHECK ("recipe_components"."variant_id" IS NULL OR ("recipe_components"."attribute_filter" = '{}'::jsonb AND NOT "recipe_components"."variant_size_produced" AND "recipe_components"."variant_size_id" IS NULL)),
	CONSTRAINT "recipe_components_one_variant_size" CHECK (NOT ("recipe_components"."variant_size_produced" AND "recipe_components"."variant_size_id" IS NOT NULL)),
	CONSTRAINT "recipe_components_not_self_replacing" CHECK ("recipe_components"."replaces_component_id" IS NULL OR "recipe_components"."replaces_component_id" <> "recipe_components"."id"),
	CONSTRAINT "recipe_components_position_nonnegative" CHECK ("recipe_components"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_size_id_fk" FOREIGN KEY ("size_id") REFERENCES "public"."sizes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sizes" ADD CONSTRAINT "product_sizes_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sizes" ADD CONSTRAINT "product_sizes_size_id_fk" FOREIGN KEY ("size_id") REFERENCES "public"."sizes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_component_values" ADD CONSTRAINT "recipe_component_values_component_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."recipe_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_component_values" ADD CONSTRAINT "recipe_component_values_size_id_fk" FOREIGN KEY ("size_id") REFERENCES "public"."sizes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_components" ADD CONSTRAINT "recipe_components_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_components" ADD CONSTRAINT "recipe_components_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_components" ADD CONSTRAINT "recipe_components_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."article_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_components" ADD CONSTRAINT "recipe_components_variant_size_id_fk" FOREIGN KEY ("variant_size_id") REFERENCES "public"."sizes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_components" ADD CONSTRAINT "recipe_components_replaces_component_id_fk" FOREIGN KEY ("replaces_component_id") REFERENCES "public"."recipe_components"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "products_name_unique" ON "products" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "products_parent_idx" ON "products" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "recipe_components_product_idx" ON "recipe_components" USING btree ("product_id","position");--> statement-breakpoint
CREATE INDEX "recipe_components_replaces_idx" ON "recipe_components" USING btree ("replaces_component_id");