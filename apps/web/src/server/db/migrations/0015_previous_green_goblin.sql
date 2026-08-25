CREATE TYPE "public"."web_research_attempt_kind" AS ENUM('search', 'open', 'connection_test', 'capture');--> statement-breakpoint
CREATE TYPE "public"."web_research_attempt_outcome" AS ENUM('succeeded', 'denied', 'blocked', 'cancelled', 'timed_out', 'rate_limited', 'failed');--> statement-breakpoint
CREATE TYPE "public"."web_research_provider" AS ENUM('tavily');--> statement-breakpoint
CREATE TYPE "public"."web_research_source_status" AS ENUM('candidate', 'opened', 'failed', 'captured', 'expired');--> statement-breakpoint
ALTER TYPE "public"."ai_action_feature" ADD VALUE 'web_research_test';--> statement-breakpoint
ALTER TYPE "public"."ai_action_feature" ADD VALUE 'web_evidence_capture';--> statement-breakpoint
ALTER TYPE "public"."ai_tool_category" ADD VALUE 'web' BEFORE 'page_draft';--> statement-breakpoint
CREATE TABLE "ai_web_research_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_action_id" uuid,
	"actor_user_id" uuid,
	"provider" "web_research_provider" NOT NULL,
	"kind" "web_research_attempt_kind" NOT NULL,
	"outcome" "web_research_attempt_outcome" NOT NULL,
	"policy_disposition" text NOT NULL,
	"search_count" integer DEFAULT 0 NOT NULL,
	"open_count" integer DEFAULT 0 NOT NULL,
	"source_chars" integer DEFAULT 0 NOT NULL,
	"provider_request_id" text,
	"latency_ms" integer,
	"credits_used" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_web_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_action_id" uuid NOT NULL,
	"originating_tool_call_id" uuid,
	"provider" "web_research_provider" NOT NULL,
	"provider_source_id" text,
	"canonical_url" text NOT NULL,
	"title" text NOT NULL,
	"snippet" text,
	"relevance_score" integer,
	"published_at" timestamp with time zone,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_encrypted" text,
	"content_hash" text,
	"status" "web_research_source_status" DEFAULT 'candidate' NOT NULL,
	"failure_code" text,
	"provider_request_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"captured_raw_page_id" uuid,
	"captured_raw_revision_id" uuid,
	"captured_at" timestamp with time zone,
	"captured_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "web_research_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "web_research_provider" "web_research_provider";--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "web_research_api_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "web_research_allowed_domains" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "web_research_blocked_domains" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "web_research_max_searches_per_turn" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "web_research_max_candidates_per_search" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "web_research_max_opened_sources_per_turn" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "web_research_max_source_chars" integer DEFAULT 16000 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "web_research_timeout_ms" integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "web_research_last_test_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "web_research_last_test_status" text;--> statement-breakpoint
ALTER TABLE "user_ai_entitlements" ADD COLUMN "web_research_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_web_research_attempts" ADD CONSTRAINT "ai_web_research_attempts_ai_action_id_ai_actions_id_fk" FOREIGN KEY ("ai_action_id") REFERENCES "public"."ai_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_web_research_attempts" ADD CONSTRAINT "ai_web_research_attempts_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_web_sources" ADD CONSTRAINT "ai_web_sources_ai_action_id_ai_actions_id_fk" FOREIGN KEY ("ai_action_id") REFERENCES "public"."ai_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_web_sources" ADD CONSTRAINT "ai_web_sources_captured_raw_page_id_pages_id_fk" FOREIGN KEY ("captured_raw_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_web_sources" ADD CONSTRAINT "ai_web_sources_captured_raw_revision_id_page_revisions_id_fk" FOREIGN KEY ("captured_raw_revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_web_sources" ADD CONSTRAINT "ai_web_sources_captured_by_users_id_fk" FOREIGN KEY ("captured_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_web_research_attempts_action_idx" ON "ai_web_research_attempts" USING btree ("ai_action_id");--> statement-breakpoint
CREATE INDEX "ai_web_research_attempts_created_idx" ON "ai_web_research_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_web_sources_action_idx" ON "ai_web_sources" USING btree ("ai_action_id");--> statement-breakpoint
CREATE INDEX "ai_web_sources_expires_idx" ON "ai_web_sources" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_web_sources_action_url_unique" ON "ai_web_sources" USING btree ("ai_action_id","canonical_url");