ALTER TABLE "partners" ADD COLUMN "share_bps" integer DEFAULT 5000 NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_share_bps_range" CHECK ("partners"."share_bps" BETWEEN 0 AND 10000);--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_share_bps_whole_percent" CHECK ("partners"."share_bps" % 100 = 0);--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_version_nonnegative" CHECK ("partners"."version" >= 0);