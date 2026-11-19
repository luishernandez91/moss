CREATE TYPE "public"."attribute_data_type" AS ENUM('text', 'number', 'list', 'boolean');--> statement-breakpoint
CREATE TABLE "article_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_type_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"data_type" "attribute_data_type" NOT NULL,
	"unit" text,
	"options" jsonb,
	"required" boolean NOT NULL,
	"defines_variant" boolean NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attributes_unit_only_number" CHECK ("attributes"."unit" IS NULL OR "attributes"."data_type" = 'number'),
	CONSTRAINT "attributes_options_only_list" CHECK (("attributes"."data_type" = 'list') = ("attributes"."options" IS NOT NULL)),
	CONSTRAINT "attributes_variant_requires_required" CHECK (NOT "attributes"."defines_variant" OR "attributes"."required")
);
--> statement-breakpoint
ALTER TABLE "attributes" ADD CONSTRAINT "attributes_article_type_id_article_types_id_fk" FOREIGN KEY ("article_type_id") REFERENCES "public"."article_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "article_types_name_unique" ON "article_types" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "attributes_type_key_unique" ON "attributes" USING btree ("article_type_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "attributes_type_name_unique" ON "attributes" USING btree ("article_type_id",lower("name"));