CREATE TYPE "public"."ai_model_discovery" AS ENUM('openai', 'openrouter', 'anthropic', 'none');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_type" AS ENUM('chat', 'embedding', 'image');--> statement-breakpoint
ALTER TYPE "public"."ai_provider_kind" ADD VALUE 'anthropic';--> statement-breakpoint
ALTER TYPE "public"."ai_provider_kind" ADD VALUE 'voyage';--> statement-breakpoint
ALTER TYPE "public"."ai_provider_kind" ADD VALUE 'minimax';--> statement-breakpoint
ALTER TABLE "ai_providers" ADD COLUMN "type" "ai_provider_type" DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD COLUMN "model_discovery" "ai_model_discovery" DEFAULT 'openai' NOT NULL;--> statement-breakpoint
UPDATE "ai_providers" SET "model_discovery" = 'openrouter' WHERE "kind" = 'openrouter';
