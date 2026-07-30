CREATE TABLE "translation_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"request_timeout_seconds" integer DEFAULT 600 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translation_settings_singleton_id" CHECK ("translation_settings"."id" = 'default'),
	CONSTRAINT "translation_settings_request_timeout_range" CHECK ("translation_settings"."request_timeout_seconds" >= 30 and "translation_settings"."request_timeout_seconds" <= 3600)
);
--> statement-breakpoint
ALTER TABLE "translation_settings" ADD CONSTRAINT "translation_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "translation_run_items_active_page_unique" ON "translation_run_items" USING btree ("target_locale","source_page_id") WHERE "translation_run_items"."status" in ('pending', 'running');