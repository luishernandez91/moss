DO $$ BEGIN IF current_setting('server_version_num')::integer < 150000 THEN RAISE EXCEPTION 'C3 requires PostgreSQL 15 or newer (NULLS NOT DISTINCT)'; END IF; END $$;
--> statement-breakpoint
CREATE TABLE "sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "sizes_key_unique" UNIQUE("key"),
	CONSTRAINT "sizes_order_nonnegative" CHECK ("sizes"."sort_order" >= 0)
);
--> statement-breakpoint
DROP INDEX "article_variants_combination_unique";--> statement-breakpoint
ALTER TABLE "article_types" ADD COLUMN "uses_size" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "article_variants" ADD COLUMN "size_id" uuid;--> statement-breakpoint
ALTER TABLE "article_variants" ADD CONSTRAINT "article_variants_size_id_sizes_id_fk" FOREIGN KEY ("size_id") REFERENCES "public"."sizes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_variants" ADD CONSTRAINT "article_variants_combination_unique" UNIQUE NULLS NOT DISTINCT("article_id","size_id","attributes");
--> statement-breakpoint
INSERT INTO sizes (key, label, sort_order) VALUES ('mini', 'Mini', 0), ('small', 'Chico', 1), ('medium', 'Mediano', 2), ('large', 'Grande', 3);
