CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."ai_action_feature" AS ENUM('provider_test', 'model_sync', 'index_rebuild', 'semantic_search', 'wiki_question', 'text_optimization', 'image_generation');--> statement-breakpoint
CREATE TYPE "public"."ai_action_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."ai_capability" AS ENUM('text_generation', 'embedding', 'image_generation');--> statement-breakpoint
CREATE TYPE "public"."ai_capability_source" AS ENUM('provider', 'catalog', 'manual');--> statement-breakpoint
CREATE TYPE "public"."ai_event_type" AS ENUM('status', 'text_delta', 'search_results', 'citations', 'optimization', 'image_ready', 'completed', 'error');--> statement-breakpoint
CREATE TYPE "public"."ai_index_status" AS ENUM('building', 'ready', 'failed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."ai_model_availability" AS ENUM('available', 'unavailable', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."ai_page_index_status" AS ENUM('pending', 'running', 'completed', 'failed', 'removed');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_kind" AS ENUM('openai_compatible', 'openrouter');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_status" AS ENUM('unverified', 'healthy', 'unavailable', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."ai_purpose" AS ENUM('wiki_text', 'wiki_embedding', 'wiki_image');--> statement-breakpoint
CREATE TYPE "public"."ai_question_mode" AS ENUM('full', 'retrieval');--> statement-breakpoint
CREATE TABLE "ai_action_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"action_id" uuid NOT NULL,
	"type" "ai_event_type" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_action_inputs" (
	"action_id" uuid PRIMARY KEY NOT NULL,
	"payload_encrypted" text NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature" "ai_action_feature" NOT NULL,
	"status" "ai_action_status" DEFAULT 'queued' NOT NULL,
	"actor_user_id" uuid,
	"provider_id" uuid,
	"model_id" uuid,
	"index_generation_id" uuid,
	"page_id" uuid,
	"question_mode" "ai_question_mode",
	"request_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"usage_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	"error_message" text,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_generated_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"content_hash" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"promoted_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promoted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_index_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"embedding_dimensions" integer NOT NULL,
	"chunker_version" text NOT NULL,
	"status" "ai_index_status" DEFAULT 'building' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"total_pages" integer DEFAULT 0 NOT NULL,
	"completed_pages" integer DEFAULT 0 NOT NULL,
	"failed_pages" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"started_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"heading_path" text[] DEFAULT '{}' NOT NULL,
	"content_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"byte_count" integer NOT NULL,
	"embedding" vector NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_model_capabilities" (
	"model_id" uuid NOT NULL,
	"capability" "ai_capability" NOT NULL,
	"supported" boolean NOT NULL,
	"source" "ai_capability_source" NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"canonical_id" text,
	"display_name" text NOT NULL,
	"availability" "ai_model_availability" DEFAULT 'unknown' NOT NULL,
	"context_window" integer,
	"max_output_tokens" integer,
	"embedding_dimensions" integer,
	"input_modalities" text[] DEFAULT '{}' NOT NULL,
	"output_modalities" text[] DEFAULT '{}' NOT NULL,
	"raw_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"manually_added" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_page_index_states" (
	"generation_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"target_revision_id" uuid,
	"target_content_hash" text,
	"status" "ai_page_index_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"last_error_message" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "ai_provider_kind" NOT NULL,
	"base_url" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"credentials_encrypted" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"status" "ai_provider_status" DEFAULT 'unverified' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error_code" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_purpose_assignments" (
	"purpose" "ai_purpose" PRIMARY KEY NOT NULL,
	"model_id" uuid NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"event_retention_hours" integer DEFAULT 24 NOT NULL,
	"artifact_retention_hours" integer DEFAULT 24 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_ai_entitlements" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"question_answering_enabled" boolean DEFAULT false NOT NULL,
	"text_optimization_enabled" boolean DEFAULT false NOT NULL,
	"image_generation_enabled" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_action_events" ADD CONSTRAINT "ai_action_events_action_id_ai_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."ai_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_action_inputs" ADD CONSTRAINT "ai_action_inputs_action_id_ai_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."ai_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_index_generation_id_ai_index_generations_id_fk" FOREIGN KEY ("index_generation_id") REFERENCES "public"."ai_index_generations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generated_artifacts" ADD CONSTRAINT "ai_generated_artifacts_action_id_ai_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."ai_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generated_artifacts" ADD CONSTRAINT "ai_generated_artifacts_promoted_asset_id_content_assets_id_fk" FOREIGN KEY ("promoted_asset_id") REFERENCES "public"."content_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_index_generations" ADD CONSTRAINT "ai_index_generations_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_index_generations" ADD CONSTRAINT "ai_index_generations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_chunks" ADD CONSTRAINT "ai_knowledge_chunks_generation_id_ai_index_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."ai_index_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_chunks" ADD CONSTRAINT "ai_knowledge_chunks_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_chunks" ADD CONSTRAINT "ai_knowledge_chunks_revision_id_page_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_capabilities" ADD CONSTRAINT "ai_model_capabilities_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_capabilities" ADD CONSTRAINT "ai_model_capabilities_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_page_index_states" ADD CONSTRAINT "ai_page_index_states_generation_id_ai_index_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."ai_index_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_page_index_states" ADD CONSTRAINT "ai_page_index_states_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_page_index_states" ADD CONSTRAINT "ai_page_index_states_target_revision_id_page_revisions_id_fk" FOREIGN KEY ("target_revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_purpose_assignments" ADD CONSTRAINT "ai_purpose_assignments_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_purpose_assignments" ADD CONSTRAINT "ai_purpose_assignments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ai_entitlements" ADD CONSTRAINT "user_ai_entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ai_entitlements" ADD CONSTRAINT "user_ai_entitlements_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_action_events_action_cursor_idx" ON "ai_action_events" USING btree ("action_id","id");--> statement-breakpoint
CREATE INDEX "ai_actions_actor_queued_idx" ON "ai_actions" USING btree ("actor_user_id","queued_at");--> statement-breakpoint
CREATE INDEX "ai_actions_status_queued_idx" ON "ai_actions" USING btree ("status","queued_at");--> statement-breakpoint
CREATE INDEX "ai_actions_provider_queued_idx" ON "ai_actions" USING btree ("provider_id","queued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_generated_artifacts_action_unique" ON "ai_generated_artifacts" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "ai_generated_artifacts_expires_idx" ON "ai_generated_artifacts" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_index_generations_active_unique" ON "ai_index_generations" USING btree ("is_active") WHERE "ai_index_generations"."is_active" = true;--> statement-breakpoint
CREATE INDEX "ai_index_generations_status_idx" ON "ai_index_generations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_knowledge_chunks_revision_unique" ON "ai_knowledge_chunks" USING btree ("generation_id","revision_id","chunk_index");--> statement-breakpoint
CREATE INDEX "ai_knowledge_chunks_generation_page_idx" ON "ai_knowledge_chunks" USING btree ("generation_id","page_id");--> statement-breakpoint
CREATE INDEX "ai_knowledge_chunks_generation_revision_idx" ON "ai_knowledge_chunks" USING btree ("generation_id","revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_model_capabilities_pk" ON "ai_model_capabilities" USING btree ("model_id","capability","source");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_models_provider_external_unique" ON "ai_models" USING btree ("provider_id","external_id");--> statement-breakpoint
CREATE INDEX "ai_models_provider_idx" ON "ai_models" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "ai_models_availability_idx" ON "ai_models" USING btree ("availability");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_page_index_states_pk" ON "ai_page_index_states" USING btree ("generation_id","page_id");--> statement-breakpoint
CREATE INDEX "ai_page_index_states_pending_idx" ON "ai_page_index_states" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_providers_name_unique" ON "ai_providers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "ai_providers_enabled_idx" ON "ai_providers" USING btree ("enabled");
