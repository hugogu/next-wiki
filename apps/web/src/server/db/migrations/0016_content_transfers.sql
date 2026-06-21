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
ALTER TYPE "public"."api_key_scope" ADD VALUE 'transfers';--> statement-breakpoint
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
CREATE INDEX "transfer_sources_type_status_idx" ON "transfer_sources" USING btree ("type","status");
