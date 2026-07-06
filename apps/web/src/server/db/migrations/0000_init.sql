CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."ai_action_feature" AS ENUM('provider_test', 'model_sync', 'index_rebuild', 'semantic_search', 'wiki_question', 'text_optimization', 'image_generation');--> statement-breakpoint
CREATE TYPE "public"."ai_action_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."ai_capability" AS ENUM('text_generation', 'embedding', 'image_generation', 'vision', 'audio', 'thinking');--> statement-breakpoint
CREATE TYPE "public"."ai_capability_source" AS ENUM('provider', 'catalog', 'manual');--> statement-breakpoint
CREATE TYPE "public"."ai_event_type" AS ENUM('status', 'text_delta', 'reasoning_delta', 'search_results', 'citations', 'optimization', 'image_ready', 'completed', 'error', 'question');--> statement-breakpoint
CREATE TYPE "public"."ai_index_status" AS ENUM('building', 'ready', 'failed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."ai_model_availability" AS ENUM('available', 'unavailable', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."ai_page_index_status" AS ENUM('pending', 'running', 'completed', 'failed', 'removed');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_kind" AS ENUM('openai_compatible', 'openrouter', 'anthropic', 'voyage', 'minimax');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_status" AS ENUM('unverified', 'healthy', 'unavailable', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_type" AS ENUM('chat', 'embedding', 'image');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_vendor" AS ENUM('openai', 'openrouter', 'anthropic', 'kimi', 'voyage', 'minimax', 'zai', 'custom');--> statement-breakpoint
CREATE TYPE "public"."ai_purpose" AS ENUM('wiki_text', 'wiki_embedding', 'wiki_image');--> statement-breakpoint
CREATE TYPE "public"."ai_question_mode" AS ENUM('full', 'retrieval');--> statement-breakpoint
CREATE TYPE "public"."api_key_scope" AS ENUM('view', 'create', 'edit', 'delete', 'share', 'run', 'storage', 'preferences', 'transfers', 'ai.read');--> statement-breakpoint
CREATE TYPE "public"."cleanup_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."content_asset_kind" AS ENUM('image');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('text/markdown');--> statement-breakpoint
CREATE TYPE "public"."migration_status" AS ENUM('pending', 'copying', 'verifying', 'completed', 'failed', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."revision_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."storage_backend_purpose" AS ENUM('primary', 'git_export');--> statement-breakpoint
CREATE TYPE "public"."storage_backend_type" AS ENUM('database', 'local', 's3', 'git');--> statement-breakpoint
CREATE TYPE "public"."storage_object_kind" AS ENUM('markdown', 'image');--> statement-breakpoint
CREATE TYPE "public"."storage_replica_state" AS ENUM('disabled', 'backfilling', 'enabled', 'degraded', 'deleting');--> statement-breakpoint
CREATE TYPE "public"."storage_replication_operation" AS ENUM('upsert', 'delete');--> statement-breakpoint
CREATE TYPE "public"."storage_replication_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."transfer_artifact_kind" AS ENUM('source_archive', 'export_archive', 'run_report');--> statement-breakpoint
CREATE TYPE "public"."transfer_artifact_status" AS ENUM('uploading', 'ready', 'expired', 'deleted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."transfer_item_action" AS ENUM('create', 'replace', 'skip', 'convert', 'validate');--> statement-breakpoint
CREATE TYPE "public"."transfer_item_kind" AS ENUM('page', 'asset', 'archive_entry');--> statement-breakpoint
CREATE TYPE "public"."transfer_item_status" AS ENUM('pending', 'running', 'completed', 'warning', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."transfer_run_kind" AS ENUM('site_export', 'archive_preview', 'archive_import', 'wikijs_source_test', 'wikijs_preview', 'wikijs_import');--> statement-breakpoint
CREATE TYPE "public"."transfer_run_phase" AS ENUM('queued', 'discovering', 'validating', 'planning', 'downloading', 'writing_assets', 'writing_pages', 'finalizing', 'completed');--> statement-breakpoint
CREATE TYPE "public"."transfer_run_status" AS ENUM('queued', 'running', 'completed', 'completed_with_warnings', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."transfer_source_status" AS ENUM('unverified', 'healthy', 'unavailable', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."transfer_source_type" AS ENUM('wikijs');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'editor', 'reader');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
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
	"error_detail" text,
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
	"type" "ai_provider_type" DEFAULT 'chat' NOT NULL,
	"vendor" "ai_provider_vendor" DEFAULT 'custom' NOT NULL,
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
	"model_detector_api_key_encrypted" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_audit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_id" uuid,
	"user_id" uuid,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status_code" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"auth_status" text NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scopes" "api_key_scope"[] NOT NULL,
	"key_prefix" text NOT NULL,
	"key_secret_encrypted" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "api_keys_key_prefix_unique" UNIQUE("key_prefix")
);
--> statement-breakpoint
CREATE TABLE "content_asset_refs" (
	"asset_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "content_asset_kind" DEFAULT 'image' NOT NULL,
	"content_hash" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "content_blobs" (
	"asset_id" uuid PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_migrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_backend_id" uuid NOT NULL,
	"target_backend_id" uuid NOT NULL,
	"status" "migration_status" DEFAULT 'pending' NOT NULL,
	"total_items" integer DEFAULT 0 NOT NULL,
	"copied_items" integer DEFAULT 0 NOT NULL,
	"verified_items" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"abort_requested" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "page_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"content_type" "content_type" DEFAULT 'text/markdown' NOT NULL,
	"content_source" text,
	"content_html" text NOT NULL,
	"content_hash" text NOT NULL,
	"author_id" uuid NOT NULL,
	"status" "revision_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"path" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"title" text NOT NULL,
	"author_id" uuid NOT NULL,
	"current_published_version_id" uuid,
	"latest_version_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"site_name" text DEFAULT 'next-wiki' NOT NULL,
	"footer_copyright" text,
	"icp_number" text,
	"icp_url" text,
	"public_security_number" text,
	"public_security_url" text,
	"icon_data" "bytea",
	"icon_mime" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"default_locale" text DEFAULT 'en' NOT NULL,
	"anonymous_read" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "storage_backends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "storage_backend_type" NOT NULL,
	"purpose" "storage_backend_purpose" DEFAULT 'primary' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"replica_state" "storage_replica_state" DEFAULT 'disabled' NOT NULL,
	"is_read_preferred" boolean DEFAULT false NOT NULL,
	"sync_started_at" timestamp with time zone,
	"sync_completed_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_encrypted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_cleanup_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backend_id" uuid NOT NULL,
	"status" "cleanup_status" DEFAULT 'pending' NOT NULL,
	"total_items" integer DEFAULT 0 NOT NULL,
	"deleted_items" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "storage_replication_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backend_id" uuid NOT NULL,
	"object_kind" "storage_object_kind" NOT NULL,
	"object_id" uuid NOT NULL,
	"operation" "storage_replication_operation" DEFAULT 'upsert' NOT NULL,
	"expected_hash" text,
	"status" "storage_replication_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system_theme_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"active_theme_id" uuid,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"css" text DEFAULT '' NOT NULL,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "transfer_artifact_kind" NOT NULL,
	"status" "transfer_artifact_status" DEFAULT 'uploading' NOT NULL,
	"created_by" uuid,
	"run_id" uuid,
	"original_filename" text,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"content_hash" text,
	"error_message" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "transfer_artifacts_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "transfer_asset_mappings" (
	"source_type" text NOT NULL,
	"source_identity" text NOT NULL,
	"source_asset_key" text NOT NULL,
	"source_fingerprint" text,
	"target_asset_id" uuid NOT NULL,
	"last_run_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" "transfer_item_kind" NOT NULL,
	"source_key" text NOT NULL,
	"source_fingerprint" text,
	"display_name" text NOT NULL,
	"target_key" text,
	"action" "transfer_item_action" NOT NULL,
	"status" "transfer_item_status" DEFAULT 'pending' NOT NULL,
	"bytes_total" integer,
	"bytes_processed" integer DEFAULT 0 NOT NULL,
	"warning_code" text,
	"warning_message" text,
	"error_code" text,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_page_mappings" (
	"source_type" text NOT NULL,
	"source_identity" text NOT NULL,
	"source_page_key" text NOT NULL,
	"source_fingerprint" text NOT NULL,
	"target_page_id" uuid NOT NULL,
	"target_path" text NOT NULL,
	"target_locale" text NOT NULL,
	"last_run_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "transfer_run_kind" NOT NULL,
	"status" "transfer_run_status" DEFAULT 'queued' NOT NULL,
	"phase" "transfer_run_phase" DEFAULT 'queued' NOT NULL,
	"actor_user_id" uuid,
	"source_id" uuid,
	"source_artifact_id" uuid,
	"preview_run_id" uuid,
	"active_mutation_slot" boolean,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_fingerprint" text,
	"total_items" integer DEFAULT 0 NOT NULL,
	"processed_items" integer DEFAULT 0 NOT NULL,
	"created_items" integer DEFAULT 0 NOT NULL,
	"replaced_items" integer DEFAULT 0 NOT NULL,
	"skipped_items" integer DEFAULT 0 NOT NULL,
	"converted_items" integer DEFAULT 0 NOT NULL,
	"warning_items" integer DEFAULT 0 NOT NULL,
	"failed_items" integer DEFAULT 0 NOT NULL,
	"current_item" text,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"error_code" text,
	"error_message" text,
	"error_detail" text,
	"report_artifact_id" uuid,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "transfer_source_type" DEFAULT 'wikijs' NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"allow_private_network" boolean DEFAULT false NOT NULL,
	"credentials_encrypted" text NOT NULL,
	"status" "transfer_source_status" DEFAULT 'unverified' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error_code" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
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
CREATE TABLE "user_appearance" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"light_colors" jsonb NOT NULL,
	"dark_colors" jsonb NOT NULL,
	"fonts" jsonb NOT NULL,
	"font_sizes" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'reader' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"must_reset_password" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"theme_preference" text,
	"locale_preference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
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
ALTER TABLE "api_audit_entries" ADD CONSTRAINT "api_audit_entries_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_audit_entries" ADD CONSTRAINT "api_audit_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_asset_refs" ADD CONSTRAINT "content_asset_refs_asset_id_content_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."content_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_asset_refs" ADD CONSTRAINT "content_asset_refs_revision_id_page_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_blobs" ADD CONSTRAINT "content_blobs_asset_id_content_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."content_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_migrations" ADD CONSTRAINT "content_migrations_source_backend_id_storage_backends_id_fk" FOREIGN KEY ("source_backend_id") REFERENCES "public"."storage_backends"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_migrations" ADD CONSTRAINT "content_migrations_target_backend_id_storage_backends_id_fk" FOREIGN KEY ("target_backend_id") REFERENCES "public"."storage_backends"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_migrations" ADD CONSTRAINT "content_migrations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_cleanup_jobs" ADD CONSTRAINT "storage_cleanup_jobs_backend_id_storage_backends_id_fk" FOREIGN KEY ("backend_id") REFERENCES "public"."storage_backends"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_cleanup_jobs" ADD CONSTRAINT "storage_cleanup_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_replication_tasks" ADD CONSTRAINT "storage_replication_tasks_backend_id_storage_backends_id_fk" FOREIGN KEY ("backend_id") REFERENCES "public"."storage_backends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_theme_settings" ADD CONSTRAINT "system_theme_settings_active_theme_id_system_themes_id_fk" FOREIGN KEY ("active_theme_id") REFERENCES "public"."system_themes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_theme_settings" ADD CONSTRAINT "system_theme_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_themes" ADD CONSTRAINT "system_themes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_artifacts" ADD CONSTRAINT "transfer_artifacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_asset_mappings" ADD CONSTRAINT "transfer_asset_mappings_target_asset_id_content_assets_id_fk" FOREIGN KEY ("target_asset_id") REFERENCES "public"."content_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_asset_mappings" ADD CONSTRAINT "transfer_asset_mappings_last_run_id_transfer_runs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "public"."transfer_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_items" ADD CONSTRAINT "transfer_items_run_id_transfer_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."transfer_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_page_mappings" ADD CONSTRAINT "transfer_page_mappings_target_page_id_pages_id_fk" FOREIGN KEY ("target_page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_page_mappings" ADD CONSTRAINT "transfer_page_mappings_last_run_id_transfer_runs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "public"."transfer_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_runs" ADD CONSTRAINT "transfer_runs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_runs" ADD CONSTRAINT "transfer_runs_source_id_transfer_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."transfer_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_sources" ADD CONSTRAINT "transfer_sources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_sources" ADD CONSTRAINT "transfer_sources_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ai_entitlements" ADD CONSTRAINT "user_ai_entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ai_entitlements" ADD CONSTRAINT "user_ai_entitlements_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_appearance" ADD CONSTRAINT "user_appearance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX "ai_providers_enabled_idx" ON "ai_providers" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "api_audit_entries_user_id_created_at_index" ON "api_audit_entries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "api_audit_entries_created_at_index" ON "api_audit_entries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "api_audit_entries_key_id_created_at_index" ON "api_audit_entries" USING btree ("key_id","created_at");--> statement-breakpoint
CREATE INDEX "api_audit_entries_status_code_index" ON "api_audit_entries" USING btree ("status_code");--> statement-breakpoint
CREATE INDEX "api_keys_user_id_revoked_at_index" ON "api_keys" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX "api_keys_user_id_index" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_asset_refs_pk" ON "content_asset_refs" USING btree ("asset_id","revision_id");--> statement-breakpoint
CREATE INDEX "content_asset_refs_revision_id_index" ON "content_asset_refs" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "content_assets_content_hash_index" ON "content_assets" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "content_assets_deleted_at_index" ON "content_assets" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "content_assets_created_by_index" ON "content_assets" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "content_migrations_status_index" ON "content_migrations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "page_revisions_page_id_version_number_index" ON "page_revisions" USING btree ("page_id","version_number");--> statement-breakpoint
CREATE INDEX "page_revisions_page_id_status_created_at_index" ON "page_revisions" USING btree ("page_id","status","created_at");--> statement-breakpoint
CREATE INDEX "page_revisions_content_hash_index" ON "page_revisions" USING btree ("content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_space_id_path_locale_index" ON "pages" USING btree ("space_id","path","locale");--> statement-breakpoint
CREATE INDEX "pages_space_id_index" ON "pages" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "pages_space_id_current_published_version_id_index" ON "pages" USING btree ("space_id","current_published_version_id") WHERE "pages"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_index" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_backends_read_preferred" ON "storage_backends" USING btree ("is_read_preferred") WHERE "storage_backends"."is_read_preferred" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "storage_backends_type_purpose" ON "storage_backends" USING btree ("type","purpose");--> statement-breakpoint
CREATE INDEX "storage_cleanup_jobs_backend_id_index" ON "storage_cleanup_jobs" USING btree ("backend_id");--> statement-breakpoint
CREATE INDEX "storage_cleanup_jobs_status_index" ON "storage_cleanup_jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_replication_tasks_delivery" ON "storage_replication_tasks" USING btree ("backend_id","object_kind","object_id","operation");--> statement-breakpoint
CREATE INDEX "storage_replication_tasks_status_available_at_index" ON "storage_replication_tasks" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "storage_replication_tasks_backend_id_status_index" ON "storage_replication_tasks" USING btree ("backend_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "system_themes_name_idx" ON "system_themes" USING btree ("name");--> statement-breakpoint
CREATE INDEX "transfer_artifacts_status_expiry_idx" ON "transfer_artifacts" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "transfer_artifacts_run_idx" ON "transfer_artifacts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "transfer_artifacts_hash_idx" ON "transfer_artifacts" USING btree ("content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_asset_mappings_source_unique" ON "transfer_asset_mappings" USING btree ("source_type","source_identity","source_asset_key");--> statement-breakpoint
CREATE INDEX "transfer_asset_mappings_fingerprint_idx" ON "transfer_asset_mappings" USING btree ("source_fingerprint");--> statement-breakpoint
CREATE INDEX "transfer_asset_mappings_target_idx" ON "transfer_asset_mappings" USING btree ("target_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_items_source_unique" ON "transfer_items" USING btree ("run_id","kind","source_key");--> statement-breakpoint
CREATE INDEX "transfer_items_pending_idx" ON "transfer_items" USING btree ("run_id","status","available_at");--> statement-breakpoint
CREATE INDEX "transfer_items_action_idx" ON "transfer_items" USING btree ("run_id","action");--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_page_mappings_source_unique" ON "transfer_page_mappings" USING btree ("source_type","source_identity","source_page_key");--> statement-breakpoint
CREATE INDEX "transfer_page_mappings_target_idx" ON "transfer_page_mappings" USING btree ("target_page_id");--> statement-breakpoint
CREATE INDEX "transfer_runs_status_queued_idx" ON "transfer_runs" USING btree ("status","queued_at");--> statement-breakpoint
CREATE INDEX "transfer_runs_kind_queued_idx" ON "transfer_runs" USING btree ("kind","queued_at");--> statement-breakpoint
CREATE INDEX "transfer_runs_source_queued_idx" ON "transfer_runs" USING btree ("source_id","queued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_runs_active_mutation_unique" ON "transfer_runs" USING btree ("active_mutation_slot") WHERE "transfer_runs"."active_mutation_slot" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_sources_name_unique" ON "transfer_sources" USING btree ("name");--> statement-breakpoint
CREATE INDEX "transfer_sources_type_status_idx" ON "transfer_sources" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "users_email_index" ON "users" USING btree ("email");
