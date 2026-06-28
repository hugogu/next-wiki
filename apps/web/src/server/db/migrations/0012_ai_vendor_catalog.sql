CREATE TYPE "public"."ai_provider_vendor" AS ENUM('openai', 'openrouter', 'anthropic', 'kimi', 'voyage', 'minimax', 'custom');--> statement-breakpoint
ALTER TABLE "ai_providers" ADD COLUMN "vendor" "ai_provider_vendor" DEFAULT 'custom' NOT NULL;--> statement-breakpoint
UPDATE "ai_providers" SET "vendor" = 'openrouter' WHERE "kind"::text = 'openrouter';--> statement-breakpoint
UPDATE "ai_providers" SET "vendor" = 'anthropic' WHERE "kind"::text = 'anthropic';--> statement-breakpoint
UPDATE "ai_providers" SET "vendor" = 'voyage' WHERE "kind"::text = 'voyage';--> statement-breakpoint
UPDATE "ai_providers" SET "vendor" = 'minimax' WHERE "kind"::text = 'minimax';--> statement-breakpoint
ALTER TABLE "ai_providers" DROP COLUMN "model_discovery";--> statement-breakpoint
DROP TYPE "public"."ai_model_discovery";
