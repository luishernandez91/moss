CREATE TYPE "public"."cost_change_reason" AS ENUM('initial', 'manual');--> statement-breakpoint
CREATE TYPE "public"."stock_unit" AS ENUM('piece', 'm', 'kg', 'l', 'bag');--> statement-breakpoint
CREATE TABLE "article_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"average_cost" integer NOT NULL,
	"price" integer,
	"stock" numeric(12, 3) DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "article_variants_sku_unique" UNIQUE("sku"),
	CONSTRAINT "article_variants_cost_non_negative" CHECK ("article_variants"."average_cost" >= 0),
	CONSTRAINT "article_variants_price_non_negative" CHECK ("article_variants"."price" IS NULL OR "article_variants"."price" >= 0),
	CONSTRAINT "article_variants_stock_non_negative" CHECK ("article_variants"."stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"stock_unit" "stock_unit" NOT NULL,
	"fixed_attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sold" boolean NOT NULL,
	"used_in_recipes" boolean NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_sold_or_recipes" CHECK ("articles"."sold" OR "articles"."used_in_recipes")
);
--> statement-breakpoint
CREATE TABLE "variant_cost_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"previous_cost" integer,
	"average_cost" integer NOT NULL,
	"reason" "cost_change_reason" NOT NULL,
	"changed_by_partner_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "article_variants" ADD CONSTRAINT "article_variants_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_article_type_id_article_types_id_fk" FOREIGN KEY ("article_type_id") REFERENCES "public"."article_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_cost_changes" ADD CONSTRAINT "variant_cost_changes_variant_id_article_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."article_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_cost_changes" ADD CONSTRAINT "variant_cost_changes_changed_by_partner_id_partners_id_fk" FOREIGN KEY ("changed_by_partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "article_variants_combination_unique" ON "article_variants" USING btree ("article_id","attributes");--> statement-breakpoint
CREATE INDEX "article_variants_attributes_idx" ON "article_variants" USING gin ("attributes" jsonb_path_ops);--> statement-breakpoint
CREATE INDEX "articles_type_idx" ON "articles" USING btree ("article_type_id");--> statement-breakpoint
CREATE INDEX "articles_fixed_attributes_idx" ON "articles" USING gin ("fixed_attributes" jsonb_path_ops);--> statement-breakpoint
CREATE INDEX "variant_cost_changes_variant_idx" ON "variant_cost_changes" USING btree ("variant_id","changed_at");