ALTER TABLE "ai_settings" ADD COLUMN "cloudflare_detector_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "cloudflare_account_id" text;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "cloudflare_api_token_encrypted" text;