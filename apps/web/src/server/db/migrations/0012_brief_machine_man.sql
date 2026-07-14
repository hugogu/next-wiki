CREATE TYPE "public"."search_capability_id" AS ENUM('full_text', 'fuzzy', 'semantic');--> statement-breakpoint
CREATE TYPE "public"."search_engine_run_state" AS ENUM('ready', 'pending', 'skipped', 'unavailable', 'failed', 'timed_out');--> statement-breakpoint
CREATE TABLE "search_engine_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_record_id" uuid NOT NULL,
	"capability_id" "search_capability_id" NOT NULL,
	"state" "search_engine_run_state" DEFAULT 'pending' NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"continuation_ref" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_engine_runs_result_count_nonnegative" CHECK ("search_engine_runs"."result_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "search_records" ADD COLUMN "capability_snapshot" jsonb DEFAULT '{"full_text":true,"fuzzy":true,"semantic":true}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "search_settings" ADD COLUMN "full_text_search_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "search_settings" ADD COLUMN "fuzzy_search_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "search_engine_runs" ADD CONSTRAINT "search_engine_runs_search_record_id_search_records_id_fk" FOREIGN KEY ("search_record_id") REFERENCES "public"."search_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "search_engine_runs_record_capability_unique" ON "search_engine_runs" USING btree ("search_record_id","capability_id");--> statement-breakpoint
CREATE INDEX "search_engine_runs_state_updated_at_index" ON "search_engine_runs" USING btree ("state","updated_at");--> statement-breakpoint
CREATE INDEX "search_engine_runs_search_record_id_updated_at_index" ON "search_engine_runs" USING btree ("search_record_id","updated_at");--> statement-breakpoint
ALTER TABLE "search_settings" ADD CONSTRAINT "search_settings_lexical_path_required" CHECK ("search_settings"."full_text_search_enabled" or "search_settings"."fuzzy_search_enabled");