CREATE TYPE "public"."campaign_event_type" AS ENUM('schedule', 'unschedule', 'cancel', 'close', 'reopen');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'scheduled', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "campaign_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"type" "campaign_event_type" NOT NULL,
	"from_status" "campaign_status" NOT NULL,
	"to_status" "campaign_status" NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"reason" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"allows_overlap" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_types_id_allows_overlap_unique" UNIQUE("id","allows_overlap")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"campaign_type_id" uuid NOT NULL,
	"allows_overlap" boolean NOT NULL,
	"budget" integer NOT NULL,
	"start_date" date,
	"end_date" date,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"reinvestment_bps" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"cloned_from_id" uuid,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_budget_non_negative" CHECK ("campaigns"."budget" >= 0),
	CONSTRAINT "campaigns_reinvestment_whole_percent" CHECK ("campaigns"."reinvestment_bps" BETWEEN 0 AND 10000 AND "campaigns"."reinvestment_bps" % 100 = 0),
	CONSTRAINT "campaigns_dates_unless_draft" CHECK ("campaigns"."status" = 'draft' OR ("campaigns"."start_date" IS NOT NULL AND "campaigns"."end_date" IS NOT NULL AND "campaigns"."start_date" <= "campaigns"."end_date"))
);
--> statement-breakpoint
ALTER TABLE "campaign_events" ADD CONSTRAINT "campaign_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_events" ADD CONSTRAINT "campaign_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_type_allows_overlap_fk" FOREIGN KEY ("campaign_type_id","allows_overlap") REFERENCES "public"."campaign_types"("id","allows_overlap") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_cloned_from_fk" FOREIGN KEY ("cloned_from_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_events_campaign_idx" ON "campaign_events" USING btree ("campaign_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_types_name_unique" ON "campaign_types" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "campaigns_type_idx" ON "campaigns" USING btree ("campaign_type_id");