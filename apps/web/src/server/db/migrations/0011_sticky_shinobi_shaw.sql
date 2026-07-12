CREATE TYPE "public"."translation_freshness_status" AS ENUM('fresh', 'stale', 'queued', 'running', 'failed', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."translation_item_status" AS ENUM('pending', 'running', 'completed', 'skipped', 'failed', 'cancelled', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."translation_run_kind" AS ENUM('initial', 'resume', 'replacement', 'refresh');--> statement-breakpoint
CREATE TYPE "public"."translation_run_status" AS ENUM('queued', 'running', 'paused', 'completed', 'completed_with_warnings', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."translation_usage_source" AS ENUM('provider_reported', 'estimated', 'unavailable');--> statement-breakpoint
CREATE TABLE "page_translation_states" (
	"translation_page_id" uuid PRIMARY KEY NOT NULL,
	"source_page_id" uuid NOT NULL,
	"translation_group_id" uuid NOT NULL,
	"target_locale" text NOT NULL,
	"freshness_status" "translation_freshness_status" DEFAULT 'stale' NOT NULL,
	"latest_source_revision_id" uuid,
	"latest_source_hash" text,
	"translated_source_revision_id" uuid,
	"translated_source_hash" text,
	"current_translated_revision_id" uuid,
	"latest_run_id" uuid,
	"latest_item_id" uuid,
	"last_error_code" text,
	"last_error_message" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_page_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translation_groups_source_page_id_unique" UNIQUE("source_page_id")
);
--> statement-breakpoint
CREATE TABLE "translation_languages" (
	"code" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"default_prompt_version_id" uuid,
	"default_model_id" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_prompt_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translation_prompt_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "translation_prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"body" text NOT NULL,
	"content_hash" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_revision_provenance" (
	"translation_revision_id" uuid PRIMARY KEY NOT NULL,
	"source_revision_id" uuid,
	"run_id" uuid,
	"item_id" uuid,
	"provider_id" uuid,
	"model_id" uuid,
	"model_external_id" text,
	"model_display_name" text,
	"prompt_version_id" uuid,
	"prompt_content_hash" text,
	"provider_request_id" text,
	"output_hash" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cached_tokens" integer,
	"usage_source" "translation_usage_source" DEFAULT 'unavailable' NOT NULL,
	"duration_ms" integer,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_run_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"source_page_id" uuid NOT NULL,
	"source_revision_id" uuid,
	"source_content_hash" text,
	"translation_page_id" uuid,
	"translation_revision_id" uuid,
	"target_locale" text NOT NULL,
	"target_path" text,
	"status" "translation_item_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"retry_available" boolean DEFAULT false NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"provider_id" uuid,
	"model_id" uuid,
	"prompt_version_id" uuid,
	"input_tokens" integer,
	"output_tokens" integer,
	"cached_tokens" integer,
	"usage_source" "translation_usage_source" DEFAULT 'unavailable' NOT NULL,
	"provider_request_id" text,
	"duration_ms" integer,
	"warning_code" text,
	"warning_message" text,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_locale" text NOT NULL,
	"kind" "translation_run_kind" DEFAULT 'initial' NOT NULL,
	"status" "translation_run_status" DEFAULT 'queued' NOT NULL,
	"predecessor_run_id" uuid,
	"trigger_run_id" uuid,
	"provider_id" uuid,
	"model_id" uuid,
	"model_external_id" text,
	"model_display_name" text,
	"prompt_version_id" uuid,
	"prompt_content_hash" text,
	"scope_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pause_requested" boolean DEFAULT false NOT NULL,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"active_language_slot" text,
	"total_items" integer DEFAULT 0 NOT NULL,
	"processed_items" integer DEFAULT 0 NOT NULL,
	"completed_items" integer DEFAULT 0 NOT NULL,
	"skipped_items" integer DEFAULT 0 NOT NULL,
	"failed_items" integer DEFAULT 0 NOT NULL,
	"superseded_items" integer DEFAULT 0 NOT NULL,
	"current_item" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cached_tokens" integer,
	"usage_source" "translation_usage_source" DEFAULT 'unavailable' NOT NULL,
	"total_duration_ms" integer DEFAULT 0 NOT NULL,
	"actor_user_id" uuid,
	"error_code" text,
	"error_message" text,
	"error_detail" text,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "translation_group_id" uuid;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "source_page_id" uuid;--> statement-breakpoint
ALTER TABLE "page_translation_states" ADD CONSTRAINT "page_translation_states_translation_page_id_pages_id_fk" FOREIGN KEY ("translation_page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translation_states" ADD CONSTRAINT "page_translation_states_source_page_id_pages_id_fk" FOREIGN KEY ("source_page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translation_states" ADD CONSTRAINT "page_translation_states_translation_group_id_translation_groups_id_fk" FOREIGN KEY ("translation_group_id") REFERENCES "public"."translation_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translation_states" ADD CONSTRAINT "page_translation_states_latest_source_revision_id_page_revisions_id_fk" FOREIGN KEY ("latest_source_revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translation_states" ADD CONSTRAINT "page_translation_states_translated_source_revision_id_page_revisions_id_fk" FOREIGN KEY ("translated_source_revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translation_states" ADD CONSTRAINT "page_translation_states_current_translated_revision_id_page_revisions_id_fk" FOREIGN KEY ("current_translated_revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translation_states" ADD CONSTRAINT "page_translation_states_latest_run_id_translation_runs_id_fk" FOREIGN KEY ("latest_run_id") REFERENCES "public"."translation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translation_states" ADD CONSTRAINT "page_translation_states_latest_item_id_translation_run_items_id_fk" FOREIGN KEY ("latest_item_id") REFERENCES "public"."translation_run_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_groups" ADD CONSTRAINT "translation_groups_source_page_id_pages_id_fk" FOREIGN KEY ("source_page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_languages" ADD CONSTRAINT "translation_languages_default_prompt_version_id_translation_prompt_versions_id_fk" FOREIGN KEY ("default_prompt_version_id") REFERENCES "public"."translation_prompt_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_languages" ADD CONSTRAINT "translation_languages_default_model_id_ai_models_id_fk" FOREIGN KEY ("default_model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_languages" ADD CONSTRAINT "translation_languages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_languages" ADD CONSTRAINT "translation_languages_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_prompt_templates" ADD CONSTRAINT "translation_prompt_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_prompt_versions" ADD CONSTRAINT "translation_prompt_versions_template_id_translation_prompt_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."translation_prompt_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_prompt_versions" ADD CONSTRAINT "translation_prompt_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_revision_provenance" ADD CONSTRAINT "translation_revision_provenance_translation_revision_id_page_revisions_id_fk" FOREIGN KEY ("translation_revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_revision_provenance" ADD CONSTRAINT "translation_revision_provenance_source_revision_id_page_revisions_id_fk" FOREIGN KEY ("source_revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_revision_provenance" ADD CONSTRAINT "translation_revision_provenance_run_id_translation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."translation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_revision_provenance" ADD CONSTRAINT "translation_revision_provenance_item_id_translation_run_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."translation_run_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_revision_provenance" ADD CONSTRAINT "translation_revision_provenance_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_revision_provenance" ADD CONSTRAINT "translation_revision_provenance_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_revision_provenance" ADD CONSTRAINT "translation_revision_provenance_prompt_version_id_translation_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."translation_prompt_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_run_items" ADD CONSTRAINT "translation_run_items_run_id_translation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."translation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_run_items" ADD CONSTRAINT "translation_run_items_source_page_id_pages_id_fk" FOREIGN KEY ("source_page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_run_items" ADD CONSTRAINT "translation_run_items_source_revision_id_page_revisions_id_fk" FOREIGN KEY ("source_revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_run_items" ADD CONSTRAINT "translation_run_items_translation_page_id_pages_id_fk" FOREIGN KEY ("translation_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_run_items" ADD CONSTRAINT "translation_run_items_translation_revision_id_page_revisions_id_fk" FOREIGN KEY ("translation_revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_run_items" ADD CONSTRAINT "translation_run_items_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_run_items" ADD CONSTRAINT "translation_run_items_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_run_items" ADD CONSTRAINT "translation_run_items_prompt_version_id_translation_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."translation_prompt_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_runs" ADD CONSTRAINT "translation_runs_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_runs" ADD CONSTRAINT "translation_runs_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_runs" ADD CONSTRAINT "translation_runs_prompt_version_id_translation_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."translation_prompt_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_runs" ADD CONSTRAINT "translation_runs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_translation_states_source_locale_idx" ON "page_translation_states" USING btree ("source_page_id","target_locale");--> statement-breakpoint
CREATE INDEX "page_translation_states_freshness_idx" ON "page_translation_states" USING btree ("freshness_status");--> statement-breakpoint
CREATE INDEX "page_translation_states_group_idx" ON "page_translation_states" USING btree ("translation_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_prompt_versions_unique" ON "translation_prompt_versions" USING btree ("template_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_run_items_source_unique" ON "translation_run_items" USING btree ("run_id","source_page_id");--> statement-breakpoint
CREATE INDEX "translation_run_items_pending_idx" ON "translation_run_items" USING btree ("run_id","status","available_at");--> statement-breakpoint
CREATE INDEX "translation_run_items_source_page_idx" ON "translation_run_items" USING btree ("source_page_id");--> statement-breakpoint
CREATE INDEX "translation_runs_locale_queued_idx" ON "translation_runs" USING btree ("target_locale","queued_at");--> statement-breakpoint
CREATE INDEX "translation_runs_status_queued_idx" ON "translation_runs" USING btree ("status","queued_at");--> statement-breakpoint
CREATE INDEX "translation_runs_actor_queued_idx" ON "translation_runs" USING btree ("actor_user_id","queued_at");--> statement-breakpoint
CREATE INDEX "translation_runs_model_queued_idx" ON "translation_runs" USING btree ("model_id","queued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_runs_active_language_unique" ON "translation_runs" USING btree ("active_language_slot");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_translation_group_locale_unique" ON "pages" USING btree ("translation_group_id","locale") WHERE "pages"."translation_group_id" is not null;--> statement-breakpoint
CREATE INDEX "pages_source_page_idx" ON "pages" USING btree ("source_page_id");