CREATE TYPE "public"."raw_conversation_capture_status" AS ENUM('not_applicable', 'pending', 'captured', 'failed', 'disabled');--> statement-breakpoint
CREATE TABLE "content_data_source_settings" (
	"source_key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_actions" ADD COLUMN "raw_conversation_page_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD COLUMN "raw_conversation_last_event_id" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD COLUMN "raw_conversation_capture_status" "raw_conversation_capture_status" DEFAULT 'not_applicable' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD COLUMN "raw_conversation_capture_error" text;--> statement-breakpoint
ALTER TABLE "raw_categories" ADD COLUMN "system_key" text;--> statement-breakpoint
ALTER TABLE "content_data_source_settings" ADD CONSTRAINT "content_data_source_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_raw_conversation_page_id_pages_id_fk" FOREIGN KEY ("raw_conversation_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_actions_raw_conversation_page_idx" ON "ai_actions" USING btree ("raw_conversation_page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_categories_system_key_unique" ON "raw_categories" USING btree ("system_key") WHERE "raw_categories"."system_key" is not null;