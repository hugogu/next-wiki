ALTER TABLE "search_settings" ADD COLUMN "immediate_search_timeout_ms" integer DEFAULT 400 NOT NULL;--> statement-breakpoint
ALTER TABLE "search_settings" ADD CONSTRAINT "search_settings_immediate_timeout_range" CHECK ("search_settings"."immediate_search_timeout_ms" >= 100 and "search_settings"."immediate_search_timeout_ms" <= 2000);
