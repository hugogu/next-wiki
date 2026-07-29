CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."actor_kind" AS ENUM('human', 'machine');--> statement-breakpoint
CREATE TYPE "public"."ai_action_feature" AS ENUM('provider_test', 'model_sync', 'index_rebuild', 'semantic_search', 'wiki_question', 'text_optimization', 'image_generation', 'wiki_tool_chat');--> statement-breakpoint
CREATE TYPE "public"."ai_action_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."ai_capability" AS ENUM('text_generation', 'embedding', 'image_generation', 'vision', 'audio', 'thinking', 'tool_calling');--> statement-breakpoint
CREATE TYPE "public"."ai_capability_source" AS ENUM('provider', 'catalog', 'manual');--> statement-breakpoint
CREATE TYPE "public"."ai_event_type" AS ENUM('status', 'text_delta', 'reasoning_delta', 'search_results', 'citations', 'optimization', 'image_ready', 'completed', 'error', 'question', 'tool_call', 'tool_proposal', 'tool_evidence');--> statement-breakpoint
CREATE TYPE "public"."ai_index_status" AS ENUM('building', 'ready', 'failed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."ai_model_availability" AS ENUM('available', 'unavailable', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."ai_page_index_status" AS ENUM('pending', 'running', 'completed', 'failed', 'removed');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_kind" AS ENUM('openai_compatible', 'openrouter', 'anthropic', 'voyage', 'minimax');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_status" AS ENUM('unverified', 'healthy', 'unavailable', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_type" AS ENUM('chat', 'embedding', 'image');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_vendor" AS ENUM('openai', 'openrouter', 'anthropic', 'kimi', 'voyage', 'minimax', 'zai', 'custom');--> statement-breakpoint
CREATE TYPE "public"."ai_purpose" AS ENUM('wiki_text', 'wiki_embedding', 'wiki_image');--> statement-breakpoint
CREATE TYPE "public"."ai_question_mode" AS ENUM('full', 'retrieval');--> statement-breakpoint
CREATE TYPE "public"."ai_tool_activation_status" AS ENUM('available', 'disabled', 'unsupported', 'future_external');--> statement-breakpoint
CREATE TYPE "public"."ai_tool_call_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'blocked', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ai_tool_category" AS ENUM('read', 'page_draft', 'metadata', 'tag', 'batch', 'raw_evidence', 'media', 'skill');--> statement-breakpoint
CREATE TYPE "public"."ai_tool_evidence_target_kind" AS ENUM('page_revision', 'proposal', 'tag_mutation', 'metadata_change');--> statement-breakpoint
CREATE TYPE "public"."ai_tool_proposal_item_apply_status" AS ENUM('pending', 'applied', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."ai_tool_proposal_item_resource_kind" AS ENUM('page', 'tag', 'page_metadata', 'raw_category', 'link');--> statement-breakpoint
CREATE TYPE "public"."ai_tool_proposal_kind" AS ENUM('tag_update', 'metadata_update', 'batch_update', 'raw_evidence_link', 'other');--> statement-breakpoint
CREATE TYPE "public"."ai_tool_proposal_status" AS ENUM('pending', 'approved', 'rejected', 'applied', 'failed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."ai_tool_provider_kind" AS ENUM('builtin_wiki', 'external_mcp');--> statement-breakpoint
CREATE TYPE "public"."ai_tool_result_retention" AS ENUM('conversation_summary', 'raw_when_durable', 'never_full_result');--> statement-breakpoint
CREATE TYPE "public"."ai_tool_review_decision" AS ENUM('none', 'admin_review');--> statement-breakpoint
CREATE TYPE "public"."ai_tool_review_policy" AS ENUM('always_review', 'review_when_requested', 'allow_immediate_for_owner');--> statement-breakpoint
CREATE TYPE "public"."ai_tool_risk_level" AS ENUM('read', 'draft_write', 'reviewed_write', 'immediate_write');--> statement-breakpoint
CREATE TYPE "public"."ai_tool_workflow_status" AS ENUM('queued', 'running', 'waiting_review', 'completed', 'failed', 'cancelled', 'limit_reached');--> statement-breakpoint
CREATE TYPE "public"."analytics_provider" AS ENUM('baidu_tongji', 'google_analytics');--> statement-breakpoint
CREATE TYPE "public"."api_key_scope" AS ENUM('view', 'create', 'edit', 'delete', 'share', 'run', 'storage', 'preferences', 'transfers', 'manage_tags', 'ai.read', 'ai.image');--> statement-breakpoint
CREATE TYPE "public"."audit_origin" AS ENUM('web', 'api', 'feishu');--> statement-breakpoint
CREATE TYPE "public"."cleanup_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."content_nature" AS ENUM('original', 'generated');--> statement-breakpoint
CREATE TYPE "public"."feishu_binding_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."feishu_connection_mode" AS ENUM('webhook', 'websocket');--> statement-breakpoint
CREATE TYPE "public"."feishu_delivery_status" AS ENUM('queued', 'running', 'delivered', 'retry', 'failed', 'blocked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."feishu_inbox_status" AS ENUM('accepted', 'processed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."feishu_notification_event_type" AS ENUM('page_published', 'ai_action_completed', 'transfer_completed');--> statement-breakpoint
CREATE TYPE "public"."feishu_session_state" AS ENUM('active', 'expired', 'reset');--> statement-breakpoint
CREATE TYPE "public"."feishu_subscription_mode" AS ENUM('direct', 'public_safe_group', 'private_recipients_group');--> statement-breakpoint
CREATE TYPE "public"."feishu_subscription_status" AS ENUM('active', 'paused', 'failing', 'action_required');--> statement-breakpoint
CREATE TYPE "public"."migration_status" AS ENUM('pending', 'copying', 'verifying', 'completed', 'failed', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."outbound_request_outcome" AS ENUM('success', 'http_error', 'transport_error', 'timeout', 'cancelled', 'invalid_response');--> statement-breakpoint
CREATE TYPE "public"."page_kind" AS ENUM('native', 'link');--> statement-breakpoint
CREATE TYPE "public"."page_visibility" AS ENUM('public', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."raw_conversation_capture_status" AS ENUM('not_applicable', 'pending', 'captured', 'failed', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."request_log_level" AS ENUM('status', 'header', 'all');--> statement-breakpoint
CREATE TYPE "public"."revision_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."search_behavior_action" AS ENUM('result_open', 'escape');--> statement-breakpoint
CREATE TYPE "public"."search_capability_id" AS ENUM('full_text', 'fuzzy', 'semantic');--> statement-breakpoint
CREATE TYPE "public"."search_engine_run_state" AS ENUM('ready', 'pending', 'skipped', 'unavailable', 'failed', 'timed_out');--> statement-breakpoint
CREATE TYPE "public"."setup_account_status" AS ENUM('needed', 'created');--> statement-breakpoint
CREATE TYPE "public"."setup_ai_status" AS ENUM('not_started', 'skipped', 'queued', 'running', 'completed', 'partial', 'failed', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."setup_sample_pages_status" AS ENUM('not_started', 'skipped', 'completed', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."setup_step" AS ENUM('account', 'ai', 'writing_mode', 'sample_pages', 'summary', 'closed');--> statement-breakpoint
CREATE TYPE "public"."skill_file_kind" AS ENUM('instruction', 'reference', 'script');--> statement-breakpoint
CREATE TYPE "public"."skill_file_operation" AS ENUM('create', 'update', 'delete', 'rename');--> statement-breakpoint
CREATE TYPE "public"."skill_source" AS ENUM('builtin', 'directory', 'managed');--> statement-breakpoint
CREATE TYPE "public"."skill_validation_state" AS ENUM('valid', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."space_kind" AS ENUM('wiki', 'raw', 'generated');--> statement-breakpoint
CREATE TYPE "public"."storage_backend_purpose" AS ENUM('primary', 'git_export');--> statement-breakpoint
CREATE TYPE "public"."storage_backend_type" AS ENUM('database', 'local', 's3', 'git');--> statement-breakpoint
CREATE TYPE "public"."storage_object_kind" AS ENUM('markdown', 'image');--> statement-breakpoint
CREATE TYPE "public"."storage_replica_state" AS ENUM('disabled', 'backfilling', 'enabled', 'degraded', 'deleting');--> statement-breakpoint
CREATE TYPE "public"."storage_replication_operation" AS ENUM('upsert', 'delete');--> statement-breakpoint
CREATE TYPE "public"."storage_replication_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."tag_mutation_kind" AS ENUM('rename', 'delete', 'merge');--> statement-breakpoint
CREATE TYPE "public"."tag_mutation_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."tool_call_strategy" AS ENUM('auto', 'native', 'text');--> statement-breakpoint
CREATE TYPE "public"."transfer_artifact_kind" AS ENUM('source_archive', 'export_archive', 'run_report');--> statement-breakpoint
CREATE TYPE "public"."transfer_artifact_status" AS ENUM('uploading', 'ready', 'expired', 'deleted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."transfer_item_action" AS ENUM('create', 'replace', 'skip', 'convert', 'validate');--> statement-breakpoint
CREATE TYPE "public"."transfer_item_kind" AS ENUM('page', 'asset', 'archive_entry');--> statement-breakpoint
CREATE TYPE "public"."transfer_item_status" AS ENUM('pending', 'running', 'completed', 'warning', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."transfer_run_kind" AS ENUM('site_export', 'archive_preview', 'archive_import', 'wikijs_source_test', 'wikijs_preview', 'wikijs_import');--> statement-breakpoint
CREATE TYPE "public"."transfer_run_phase" AS ENUM('queued', 'discovering', 'validating', 'planning', 'downloading', 'writing_assets', 'writing_pages', 'finalizing', 'completed');--> statement-breakpoint
CREATE TYPE "public"."transfer_run_status" AS ENUM('queued', 'running', 'paused', 'completed', 'completed_with_warnings', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."transfer_source_status" AS ENUM('unverified', 'healthy', 'unavailable', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."transfer_source_type" AS ENUM('wikijs');--> statement-breakpoint
CREATE TYPE "public"."translation_freshness_status" AS ENUM('fresh', 'stale', 'queued', 'running', 'failed', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."translation_item_status" AS ENUM('pending', 'running', 'completed', 'skipped', 'failed', 'cancelled', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."translation_run_kind" AS ENUM('initial', 'resume', 'replacement', 'refresh');--> statement-breakpoint
CREATE TYPE "public"."translation_run_status" AS ENUM('queued', 'running', 'paused', 'completed', 'completed_with_warnings', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."translation_usage_source" AS ENUM('provider_reported', 'estimated', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'editor', 'reader');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."writing_mode" AS ENUM('copilot', 'llm-wiki');--> statement-breakpoint
CREATE TABLE "ai_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"ai_action_id" uuid NOT NULL,
	"provider_key" text NOT NULL,
	"tool_name" text NOT NULL,
	"sequence" integer NOT NULL,
	"command_markdown" text NOT NULL,
	"arguments" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "ai_tool_call_status" DEFAULT 'queued' NOT NULL,
	"requested_review" "ai_tool_review_decision" DEFAULT 'none' NOT NULL,
	"effective_review" "ai_tool_review_decision" DEFAULT 'none' NOT NULL,
	"result_summary" text,
	"result_hash" text,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_tool_change_proposal_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"resource_kind" "ai_tool_proposal_item_resource_kind" NOT NULL,
	"resource_id" uuid,
	"before_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"after_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"base_version_id" uuid,
	"state_hash" text DEFAULT '' NOT NULL,
	"apply_status" "ai_tool_proposal_item_apply_status" DEFAULT 'pending' NOT NULL,
	"error_code" text,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "ai_tool_change_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid,
	"tool_call_id" uuid,
	"kind" "ai_tool_proposal_kind" NOT NULL,
	"title" text NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"status" "ai_tool_proposal_status" DEFAULT 'pending' NOT NULL,
	"requested_review" "ai_tool_review_decision" DEFAULT 'admin_review' NOT NULL,
	"effective_review" "ai_tool_review_decision" DEFAULT 'admin_review' NOT NULL,
	"created_by_action_id" uuid,
	"created_by_user_id" uuid,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"conflict_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_tool_evidence_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool_call_id" uuid,
	"raw_page_id" uuid,
	"source_revision_id" uuid,
	"target_kind" "ai_tool_evidence_target_kind" NOT NULL,
	"target_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_tool_evidence_links_anchor" CHECK (("ai_tool_evidence_links"."raw_page_id" is not null) <> ("ai_tool_evidence_links"."source_revision_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "ai_tool_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"tool_name" text,
	"category" "ai_tool_category",
	"enabled" boolean DEFAULT true NOT NULL,
	"review_policy" "ai_tool_review_policy" DEFAULT 'always_review' NOT NULL,
	"max_calls_per_turn" integer DEFAULT 100 NOT NULL,
	"timeout_ms" integer DEFAULT 30000 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_tool_policies_bounds" CHECK ("ai_tool_policies"."max_calls_per_turn" >= 1 and "ai_tool_policies"."max_calls_per_turn" <= 100 and "ai_tool_policies"."timeout_ms" >= 1000 and "ai_tool_policies"."timeout_ms" <= 120000)
);
--> statement-breakpoint
CREATE TABLE "ai_tool_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"kind" "ai_tool_provider_kind" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"activation_status" "ai_tool_activation_status" DEFAULT 'available' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_tool_providers_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "ai_tool_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_action_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"status" "ai_tool_workflow_status" DEFAULT 'queued' NOT NULL,
	"max_calls" integer DEFAULT 100 NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
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
	"raw_conversation_page_id" uuid,
	"raw_conversation_last_event_id" bigint DEFAULT 0 NOT NULL,
	"raw_conversation_capture_status" "raw_conversation_capture_status" DEFAULT 'not_applicable' NOT NULL,
	"raw_conversation_capture_error" text,
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
	"placement_payload_encrypted" text,
	"placement_payload_hash" text,
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
	"tool_call_strategy" "tool_call_strategy" DEFAULT 'auto' NOT NULL,
	"native_tool_call_failed_at" timestamp with time zone,
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
	"event_retention_hours" integer DEFAULT 720 NOT NULL,
	"artifact_retention_hours" integer DEFAULT 24 NOT NULL,
	"wiki_question_min_relevance_score" integer DEFAULT 500 NOT NULL,
	"model_detector_api_key_encrypted" text,
	"cloudflare_detector_enabled" boolean DEFAULT false NOT NULL,
	"cloudflare_account_id" text,
	"cloudflare_api_token_encrypted" text,
	"tool_max_calls" integer DEFAULT 100 NOT NULL,
	"tool_result_max_chars" integer DEFAULT 32768 NOT NULL,
	"tool_planner_temperature" integer DEFAULT 10 NOT NULL,
	"tool_planner_max_output_tokens" integer DEFAULT 32768 NOT NULL,
	"tool_planner_timeout_ms" integer DEFAULT 120000 NOT NULL,
	"assistant_system_prompt" text,
	"tool_system_prompt" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_provider_settings" (
	"provider" "analytics_provider" PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"tracking_id" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_audit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_id" uuid,
	"user_id" uuid,
	"entry_type" text DEFAULT 'api' NOT NULL,
	"origin" "audit_origin" DEFAULT 'web' NOT NULL,
	"external_correlation_id" text,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status_code" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"auth_status" text NOT NULL,
	"error_message" text,
	"metadata" jsonb,
	"ip" text,
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
	"kind" text DEFAULT 'image' NOT NULL,
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
CREATE TABLE "content_data_source_settings" (
	"source_key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "feishu_app_registration_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid NOT NULL,
	"domain" text NOT NULL,
	"device_code_encrypted" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_polled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feishu_binding_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"open_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feishu_binding_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "feishu_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"open_id" text NOT NULL,
	"union_id" text,
	"display_name" text,
	"status" "feishu_binding_status" DEFAULT 'active' NOT NULL,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text
);
--> statement-breakpoint
CREATE TABLE "feishu_bot_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"binding_id" uuid NOT NULL,
	"chat_id" text NOT NULL,
	"ai_action_id" uuid,
	"state" "feishu_session_state" DEFAULT 'active' NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feishu_inbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_key" text NOT NULL,
	"event_type" text NOT NULL,
	"source_event_id" text NOT NULL,
	"open_id" text,
	"chat_id" text,
	"status" "feishu_inbox_status" DEFAULT 'accepted' NOT NULL,
	"correlation_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feishu_integration_config" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text,
	"app_secret_encrypted" text,
	"encrypt_key_encrypted" text,
	"verification_token_encrypted" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"connection_mode" "feishu_connection_mode" DEFAULT 'webhook' NOT NULL,
	"user_rate_limit_per_minute" integer DEFAULT 10 NOT NULL,
	"chat_rate_limit_per_minute" integer DEFAULT 30 NOT NULL,
	"notification_retention_hours" integer DEFAULT 72 NOT NULL,
	"last_connected_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feishu_notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_action_id" uuid,
	"event_id" uuid,
	"subscription_id" uuid,
	"recipient_binding_id" uuid,
	"target_open_id" text,
	"target_chat_id" text,
	"status" "feishu_delivery_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_by" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "feishu_notification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "feishu_notification_event_type" NOT NULL,
	"page_id" uuid,
	"space_id" uuid,
	"ai_action_id" uuid,
	"transfer_id" uuid,
	"safe_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feishu_notification_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" "feishu_notification_event_type" NOT NULL,
	"mode" "feishu_subscription_mode" NOT NULL,
	"target_open_id" text,
	"target_chat_id" text,
	"space_id" uuid,
	"status" "feishu_subscription_status" DEFAULT 'active' NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_revision_metadata" (
	"revision_id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"metadata_date" date,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_revision_tags" (
	"revision_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"tag_name" text NOT NULL,
	"normalized_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"content_type" text DEFAULT 'text/markdown' NOT NULL,
	"content_source" text,
	"content_html" text NOT NULL,
	"content_hash" text NOT NULL,
	"author_id" uuid NOT NULL,
	"status" "revision_status" DEFAULT 'draft' NOT NULL,
	"actor_kind" "actor_kind" DEFAULT 'human' NOT NULL,
	"source_metadata" jsonb,
	"link_target_page_id" uuid,
	"original_asset_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_revisions_content_type_grammar" CHECK ("page_revisions"."content_type" ~ '^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$')
);
--> statement-breakpoint
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
	"translation_group_id" uuid,
	"source_page_id" uuid,
	"kind" "page_kind" DEFAULT 'native' NOT NULL,
	"link_target_page_id" uuid,
	"nature" "content_nature" DEFAULT 'original' NOT NULL,
	"visibility" "page_visibility" DEFAULT 'public' NOT NULL,
	"raw_category_id" uuid,
	"write_metadata_to_frontmatter" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_link_kind_target_pair" CHECK (("pages"."kind" = 'link') = ("pages"."link_target_page_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "raw_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_retired" boolean DEFAULT false NOT NULL,
	"system_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "search_behaviors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"search_record_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" "search_behavior_action" NOT NULL,
	"page_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_behaviors_action_page_shape" CHECK (("search_behaviors"."action" = 'result_open' AND "search_behaviors"."page_id" IS NOT NULL) OR ("search_behaviors"."action" = 'escape' AND "search_behaviors"."page_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "search_engine_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_record_id" uuid NOT NULL,
	"capability_id" "search_capability_id" NOT NULL,
	"state" "search_engine_run_state" DEFAULT 'pending' NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"continuation_ref" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_engine_runs_result_count_nonnegative" CHECK ("search_engine_runs"."result_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "search_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"session_id" uuid NOT NULL,
	"query" text NOT NULL,
	"keyword_result_count" integer DEFAULT 0 NOT NULL,
	"semantic_result_count" integer DEFAULT 0 NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"semantic_state" text DEFAULT 'skipped' NOT NULL,
	"semantic_action_id" uuid,
	"capability_snapshot" jsonb DEFAULT '{"full_text":true,"fuzzy":true,"semantic":true}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"semantic_search_enabled" boolean DEFAULT true NOT NULL,
	"full_text_search_enabled" boolean DEFAULT true NOT NULL,
	"fuzzy_search_enabled" boolean DEFAULT true NOT NULL,
	"immediate_search_timeout_ms" integer DEFAULT 400 NOT NULL,
	"min_relevance_score" integer DEFAULT 0 NOT NULL,
	"show_excerpts" boolean DEFAULT true NOT NULL,
	"excerpt_length" integer DEFAULT 120 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_settings_singleton_id" CHECK ("search_settings"."id" = 'default'),
	CONSTRAINT "search_settings_min_relevance_score_range" CHECK ("search_settings"."min_relevance_score" >= -100 and "search_settings"."min_relevance_score" <= 100),
	CONSTRAINT "search_settings_excerpt_length_range" CHECK ("search_settings"."excerpt_length" >= 20 and "search_settings"."excerpt_length" <= 500),
	CONSTRAINT "search_settings_immediate_timeout_range" CHECK ("search_settings"."immediate_search_timeout_ms" >= 100 and "search_settings"."immediate_search_timeout_ms" <= 2000),
	CONSTRAINT "search_settings_lexical_path_required" CHECK ("search_settings"."full_text_search_enabled" or "search_settings"."fuzzy_search_enabled")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setup_progress" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"admin_user_id" uuid,
	"account_status" "setup_account_status" DEFAULT 'needed' NOT NULL,
	"ai_status" "setup_ai_status" DEFAULT 'not_started' NOT NULL,
	"sample_pages_status" "setup_sample_pages_status" DEFAULT 'not_started' NOT NULL,
	"current_step" "setup_step" DEFAULT 'account' NOT NULL,
	"ai_action_id" uuid,
	"ai_result" jsonb,
	"sample_pages_result" jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setup_progress_singleton_id" CHECK ("setup_progress"."id" = 'default')
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
	"kind" "space_kind" DEFAULT 'wiki' NOT NULL,
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
CREATE TABLE "tag_mutations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_id" uuid NOT NULL,
	"target_tag_id" uuid,
	"kind" "tag_mutation_kind" NOT NULL,
	"status" "tag_mutation_status" DEFAULT 'queued' NOT NULL,
	"requested_name" text,
	"requested_by" uuid,
	"affected_page_count" integer,
	"failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
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
	"pause_requested" boolean DEFAULT false NOT NULL,
	"error_code" text,
	"error_message" text,
	"error_detail" text,
	"report_artifact_id" uuid,
	"cleaned_at" timestamp with time zone,
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
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "writing_mode_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"mode" "writing_mode" DEFAULT 'copilot' NOT NULL,
	"pending_mode" "writing_mode",
	"switch_job_id" uuid,
	"switch_options" jsonb,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "writing_mode_settings_singleton_id" CHECK ("writing_mode_settings"."id" = 'default'),
	CONSTRAINT "writing_mode_settings_switch_pair" CHECK (("writing_mode_settings"."pending_mode" is null) = ("writing_mode_settings"."switch_job_id" is null))
);
--> statement-breakpoint
CREATE TABLE "outbound_request_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"provider_key" text,
	"operation" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"method" text NOT NULL,
	"target_host" text,
	"target_path" text,
	"status_code" integer,
	"outcome" "outbound_request_outcome" NOT NULL,
	"error_code" text,
	"error_message" text,
	"provider_request_id" text,
	"correlation_id" text,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cached_input_tokens" integer,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"capture_level" "request_log_level" NOT NULL,
	"target_encrypted" text,
	"request_headers_encrypted" text,
	"response_headers_encrypted" text,
	"request_body_encrypted" text,
	"response_body_encrypted" text,
	"error_detail_encrypted" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_request_logs_attempt_positive" CHECK ("outbound_request_logs"."attempt" >= 1),
	CONSTRAINT "outbound_request_logs_duration_nonnegative" CHECK ("outbound_request_logs"."duration_ms" is null or "outbound_request_logs"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "request_log_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"level" "request_log_level" DEFAULT 'status' NOT NULL,
	"retention_hours" integer DEFAULT 24 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_log_settings_singleton_id" CHECK ("request_log_settings"."id" = 'default'),
	CONSTRAINT "request_log_settings_retention_bounds" CHECK ("request_log_settings"."retention_hours" between 1 and 168)
);
--> statement-breakpoint
CREATE TABLE "skill_file_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"path" text NOT NULL,
	"revision" integer NOT NULL,
	"content" text NOT NULL,
	"operation" "skill_file_operation" NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"path" text NOT NULL,
	"kind" "skill_file_kind" NOT NULL,
	"content" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_files_revision_positive" CHECK ("skill_files"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "skill_settings" (
	"name" text PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"last_used_at" timestamp with time zone,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source" "skill_source" NOT NULL,
	"description" text NOT NULL,
	"validation_state" "skill_validation_state" DEFAULT 'valid' NOT NULL,
	"validation_error" text,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_name_format" CHECK ("skills"."name" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "skills_source_stored" CHECK ("skills"."source" <> 'directory')
);
--> statement-breakpoint
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_workflow_id_ai_tool_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."ai_tool_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_ai_action_id_ai_actions_id_fk" FOREIGN KEY ("ai_action_id") REFERENCES "public"."ai_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_change_proposal_items" ADD CONSTRAINT "ai_tool_change_proposal_items_proposal_id_ai_tool_change_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."ai_tool_change_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_change_proposals" ADD CONSTRAINT "ai_tool_change_proposals_workflow_id_ai_tool_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."ai_tool_workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_change_proposals" ADD CONSTRAINT "ai_tool_change_proposals_tool_call_id_ai_tool_calls_id_fk" FOREIGN KEY ("tool_call_id") REFERENCES "public"."ai_tool_calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_change_proposals" ADD CONSTRAINT "ai_tool_change_proposals_created_by_action_id_ai_actions_id_fk" FOREIGN KEY ("created_by_action_id") REFERENCES "public"."ai_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_change_proposals" ADD CONSTRAINT "ai_tool_change_proposals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_change_proposals" ADD CONSTRAINT "ai_tool_change_proposals_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_evidence_links" ADD CONSTRAINT "ai_tool_evidence_links_tool_call_id_ai_tool_calls_id_fk" FOREIGN KEY ("tool_call_id") REFERENCES "public"."ai_tool_calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_evidence_links" ADD CONSTRAINT "ai_tool_evidence_links_raw_page_id_pages_id_fk" FOREIGN KEY ("raw_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_evidence_links" ADD CONSTRAINT "ai_tool_evidence_links_source_revision_id_page_revisions_id_fk" FOREIGN KEY ("source_revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_policies" ADD CONSTRAINT "ai_tool_policies_provider_id_ai_tool_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_tool_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_policies" ADD CONSTRAINT "ai_tool_policies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_workflows" ADD CONSTRAINT "ai_tool_workflows_ai_action_id_ai_actions_id_fk" FOREIGN KEY ("ai_action_id") REFERENCES "public"."ai_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_workflows" ADD CONSTRAINT "ai_tool_workflows_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_action_events" ADD CONSTRAINT "ai_action_events_action_id_ai_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."ai_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_action_inputs" ADD CONSTRAINT "ai_action_inputs_action_id_ai_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."ai_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_index_generation_id_ai_index_generations_id_fk" FOREIGN KEY ("index_generation_id") REFERENCES "public"."ai_index_generations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_raw_conversation_page_id_pages_id_fk" FOREIGN KEY ("raw_conversation_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "analytics_provider_settings" ADD CONSTRAINT "analytics_provider_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_audit_entries" ADD CONSTRAINT "api_audit_entries_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_audit_entries" ADD CONSTRAINT "api_audit_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_asset_refs" ADD CONSTRAINT "content_asset_refs_asset_id_content_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."content_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_asset_refs" ADD CONSTRAINT "content_asset_refs_revision_id_page_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_blobs" ADD CONSTRAINT "content_blobs_asset_id_content_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."content_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_data_source_settings" ADD CONSTRAINT "content_data_source_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_migrations" ADD CONSTRAINT "content_migrations_source_backend_id_storage_backends_id_fk" FOREIGN KEY ("source_backend_id") REFERENCES "public"."storage_backends"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_migrations" ADD CONSTRAINT "content_migrations_target_backend_id_storage_backends_id_fk" FOREIGN KEY ("target_backend_id") REFERENCES "public"."storage_backends"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_migrations" ADD CONSTRAINT "content_migrations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_app_registration_sessions" ADD CONSTRAINT "feishu_app_registration_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_bindings" ADD CONSTRAINT "feishu_bindings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_bot_sessions" ADD CONSTRAINT "feishu_bot_sessions_binding_id_feishu_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."feishu_bindings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_bot_sessions" ADD CONSTRAINT "feishu_bot_sessions_ai_action_id_ai_actions_id_fk" FOREIGN KEY ("ai_action_id") REFERENCES "public"."ai_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_deliveries" ADD CONSTRAINT "feishu_notification_deliveries_ai_action_id_ai_actions_id_fk" FOREIGN KEY ("ai_action_id") REFERENCES "public"."ai_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_deliveries" ADD CONSTRAINT "feishu_notification_deliveries_event_id_feishu_notification_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."feishu_notification_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_deliveries" ADD CONSTRAINT "feishu_notification_deliveries_subscription_id_feishu_notification_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."feishu_notification_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_deliveries" ADD CONSTRAINT "feishu_notification_deliveries_recipient_binding_id_feishu_bindings_id_fk" FOREIGN KEY ("recipient_binding_id") REFERENCES "public"."feishu_bindings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_events" ADD CONSTRAINT "feishu_notification_events_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_events" ADD CONSTRAINT "feishu_notification_events_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_events" ADD CONSTRAINT "feishu_notification_events_ai_action_id_ai_actions_id_fk" FOREIGN KEY ("ai_action_id") REFERENCES "public"."ai_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_events" ADD CONSTRAINT "feishu_notification_events_transfer_id_transfer_runs_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."transfer_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_subscriptions" ADD CONSTRAINT "feishu_notification_subscriptions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_subscriptions" ADD CONSTRAINT "feishu_notification_subscriptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revision_metadata" ADD CONSTRAINT "page_revision_metadata_revision_id_page_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revision_tags" ADD CONSTRAINT "page_revision_tags_revision_id_page_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revision_tags" ADD CONSTRAINT "page_revision_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_original_asset_id_content_assets_id_fk" FOREIGN KEY ("original_asset_id") REFERENCES "public"."content_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translation_states" ADD CONSTRAINT "page_translation_states_translation_page_id_pages_id_fk" FOREIGN KEY ("translation_page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translation_states" ADD CONSTRAINT "page_translation_states_source_page_id_pages_id_fk" FOREIGN KEY ("source_page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translation_states" ADD CONSTRAINT "page_translation_states_translation_group_id_translation_groups_id_fk" FOREIGN KEY ("translation_group_id") REFERENCES "public"."translation_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translation_states" ADD CONSTRAINT "page_translation_states_latest_source_revision_id_page_revisions_id_fk" FOREIGN KEY ("latest_source_revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translation_states" ADD CONSTRAINT "page_translation_states_translated_source_revision_id_page_revisions_id_fk" FOREIGN KEY ("translated_source_revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translation_states" ADD CONSTRAINT "page_translation_states_current_translated_revision_id_page_revisions_id_fk" FOREIGN KEY ("current_translated_revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translation_states" ADD CONSTRAINT "page_translation_states_latest_run_id_translation_runs_id_fk" FOREIGN KEY ("latest_run_id") REFERENCES "public"."translation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translation_states" ADD CONSTRAINT "page_translation_states_latest_item_id_translation_run_items_id_fk" FOREIGN KEY ("latest_item_id") REFERENCES "public"."translation_run_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_raw_category_id_raw_categories_id_fk" FOREIGN KEY ("raw_category_id") REFERENCES "public"."raw_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_categories" ADD CONSTRAINT "raw_categories_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_behaviors" ADD CONSTRAINT "search_behaviors_search_record_id_search_records_id_fk" FOREIGN KEY ("search_record_id") REFERENCES "public"."search_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_behaviors" ADD CONSTRAINT "search_behaviors_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_behaviors" ADD CONSTRAINT "search_behaviors_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_engine_runs" ADD CONSTRAINT "search_engine_runs_search_record_id_search_records_id_fk" FOREIGN KEY ("search_record_id") REFERENCES "public"."search_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_records" ADD CONSTRAINT "search_records_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_records" ADD CONSTRAINT "search_records_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_progress" ADD CONSTRAINT "setup_progress_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_progress" ADD CONSTRAINT "setup_progress_ai_action_id_ai_actions_id_fk" FOREIGN KEY ("ai_action_id") REFERENCES "public"."ai_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_cleanup_jobs" ADD CONSTRAINT "storage_cleanup_jobs_backend_id_storage_backends_id_fk" FOREIGN KEY ("backend_id") REFERENCES "public"."storage_backends"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_cleanup_jobs" ADD CONSTRAINT "storage_cleanup_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_replication_tasks" ADD CONSTRAINT "storage_replication_tasks_backend_id_storage_backends_id_fk" FOREIGN KEY ("backend_id") REFERENCES "public"."storage_backends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_theme_settings" ADD CONSTRAINT "system_theme_settings_active_theme_id_system_themes_id_fk" FOREIGN KEY ("active_theme_id") REFERENCES "public"."system_themes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_theme_settings" ADD CONSTRAINT "system_theme_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_themes" ADD CONSTRAINT "system_themes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_mutations" ADD CONSTRAINT "tag_mutations_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_mutations" ADD CONSTRAINT "tag_mutations_target_tag_id_tags_id_fk" FOREIGN KEY ("target_tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_mutations" ADD CONSTRAINT "tag_mutations_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "user_ai_entitlements" ADD CONSTRAINT "user_ai_entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ai_entitlements" ADD CONSTRAINT "user_ai_entitlements_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_appearance" ADD CONSTRAINT "user_appearance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_mode_settings" ADD CONSTRAINT "writing_mode_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_log_settings" ADD CONSTRAINT "request_log_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_file_revisions" ADD CONSTRAINT "skill_file_revisions_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_file_revisions" ADD CONSTRAINT "skill_file_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_files" ADD CONSTRAINT "skill_files_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_files" ADD CONSTRAINT "skill_files_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_settings" ADD CONSTRAINT "skill_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_tool_calls_workflow_sequence_unique" ON "ai_tool_calls" USING btree ("workflow_id","sequence");--> statement-breakpoint
CREATE INDEX "ai_tool_calls_action_idx" ON "ai_tool_calls" USING btree ("ai_action_id");--> statement-breakpoint
CREATE INDEX "ai_tool_change_proposal_items_proposal_idx" ON "ai_tool_change_proposal_items" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "ai_tool_change_proposals_status_idx" ON "ai_tool_change_proposals" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ai_tool_change_proposals_kind_idx" ON "ai_tool_change_proposals" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "ai_tool_change_proposals_actor_idx" ON "ai_tool_change_proposals" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "ai_tool_evidence_links_target_idx" ON "ai_tool_evidence_links" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "ai_tool_evidence_links_tool_call_idx" ON "ai_tool_evidence_links" USING btree ("tool_call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_tool_policies_provider_default_unique" ON "ai_tool_policies" USING btree ("provider_id") WHERE "ai_tool_policies"."tool_name" is null and "ai_tool_policies"."category" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_tool_policies_provider_category_unique" ON "ai_tool_policies" USING btree ("provider_id","category") WHERE "ai_tool_policies"."tool_name" is null and "ai_tool_policies"."category" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_tool_policies_provider_tool_unique" ON "ai_tool_policies" USING btree ("provider_id","tool_name") WHERE "ai_tool_policies"."tool_name" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_tool_workflows_action_unique" ON "ai_tool_workflows" USING btree ("ai_action_id");--> statement-breakpoint
CREATE INDEX "ai_tool_workflows_status_idx" ON "ai_tool_workflows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_action_events_action_cursor_idx" ON "ai_action_events" USING btree ("action_id","id");--> statement-breakpoint
CREATE INDEX "ai_actions_actor_queued_idx" ON "ai_actions" USING btree ("actor_user_id","queued_at");--> statement-breakpoint
CREATE INDEX "ai_actions_status_queued_idx" ON "ai_actions" USING btree ("status","queued_at");--> statement-breakpoint
CREATE INDEX "ai_actions_provider_queued_idx" ON "ai_actions" USING btree ("provider_id","queued_at");--> statement-breakpoint
CREATE INDEX "ai_actions_raw_conversation_page_idx" ON "ai_actions" USING btree ("raw_conversation_page_id");--> statement-breakpoint
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
CREATE INDEX "api_audit_entries_entry_type_created_at_index" ON "api_audit_entries" USING btree ("entry_type","created_at");--> statement-breakpoint
CREATE INDEX "api_audit_entries_origin_created_at_index" ON "api_audit_entries" USING btree ("origin","created_at");--> statement-breakpoint
CREATE INDEX "api_audit_entries_external_correlation_id_index" ON "api_audit_entries" USING btree ("external_correlation_id");--> statement-breakpoint
CREATE INDEX "api_keys_user_id_revoked_at_index" ON "api_keys" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX "api_keys_user_id_index" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_asset_refs_pk" ON "content_asset_refs" USING btree ("asset_id","revision_id");--> statement-breakpoint
CREATE INDEX "content_asset_refs_revision_id_index" ON "content_asset_refs" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "content_assets_content_hash_index" ON "content_assets" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "content_assets_deleted_at_index" ON "content_assets" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "content_assets_created_by_index" ON "content_assets" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "content_migrations_status_index" ON "content_migrations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "feishu_app_registration_sessions_creator_expires_idx" ON "feishu_app_registration_sessions" USING btree ("created_by","expires_at");--> statement-breakpoint
CREATE INDEX "feishu_app_registration_sessions_expires_idx" ON "feishu_app_registration_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "feishu_binding_tokens_open_id_idx" ON "feishu_binding_tokens" USING btree ("open_id");--> statement-breakpoint
CREATE INDEX "feishu_binding_tokens_expires_idx" ON "feishu_binding_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_bindings_active_open_id" ON "feishu_bindings" USING btree ("open_id") WHERE "feishu_bindings"."status" = 'active';--> statement-breakpoint
CREATE INDEX "feishu_bindings_user_idx" ON "feishu_bindings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feishu_bindings_open_id_idx" ON "feishu_bindings" USING btree ("open_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_bot_sessions_active" ON "feishu_bot_sessions" USING btree ("binding_id","chat_id") WHERE "feishu_bot_sessions"."state" = 'active';--> statement-breakpoint
CREATE INDEX "feishu_bot_sessions_expires_idx" ON "feishu_bot_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_inbox_events_dedupe" ON "feishu_inbox_events" USING btree ("tenant_key","event_type","source_event_id");--> statement-breakpoint
CREATE INDEX "feishu_inbox_events_open_rate_idx" ON "feishu_inbox_events" USING btree ("open_id","received_at");--> statement-breakpoint
CREATE INDEX "feishu_inbox_events_chat_rate_idx" ON "feishu_inbox_events" USING btree ("chat_id","received_at");--> statement-breakpoint
CREATE INDEX "feishu_inbox_events_expires_idx" ON "feishu_inbox_events" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_deliveries_answer_unique" ON "feishu_notification_deliveries" USING btree ("ai_action_id") WHERE "feishu_notification_deliveries"."ai_action_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_deliveries_notif_recipient_unique" ON "feishu_notification_deliveries" USING btree ("event_id","subscription_id","recipient_binding_id") WHERE "feishu_notification_deliveries"."event_id" is not null and "feishu_notification_deliveries"."recipient_binding_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_deliveries_notif_group_unique" ON "feishu_notification_deliveries" USING btree ("event_id","subscription_id") WHERE "feishu_notification_deliveries"."event_id" is not null and "feishu_notification_deliveries"."recipient_binding_id" is null;--> statement-breakpoint
CREATE INDEX "feishu_deliveries_due_idx" ON "feishu_notification_deliveries" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "feishu_deliveries_subscription_idx" ON "feishu_notification_deliveries" USING btree ("subscription_id","status");--> statement-breakpoint
CREATE INDEX "feishu_notification_events_type_idx" ON "feishu_notification_events" USING btree ("type","occurred_at");--> statement-breakpoint
CREATE INDEX "feishu_notification_events_expires_idx" ON "feishu_notification_events" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "feishu_subscriptions_event_type_idx" ON "feishu_notification_subscriptions" USING btree ("event_type","status");--> statement-breakpoint
CREATE INDEX "feishu_subscriptions_status_idx" ON "feishu_notification_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "page_revision_tags_revision_id_tag_id_index" ON "page_revision_tags" USING btree ("revision_id","tag_id");--> statement-breakpoint
CREATE INDEX "page_revision_tags_tag_id_index" ON "page_revision_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_revisions_page_id_version_number_index" ON "page_revisions" USING btree ("page_id","version_number");--> statement-breakpoint
CREATE INDEX "page_revisions_page_id_status_created_at_index" ON "page_revisions" USING btree ("page_id","status","created_at");--> statement-breakpoint
CREATE INDEX "page_revisions_content_hash_index" ON "page_revisions" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "page_revisions_original_asset_idx" ON "page_revisions" USING btree ("original_asset_id");--> statement-breakpoint
CREATE INDEX "page_translation_states_source_locale_idx" ON "page_translation_states" USING btree ("source_page_id","target_locale");--> statement-breakpoint
CREATE INDEX "page_translation_states_freshness_idx" ON "page_translation_states" USING btree ("freshness_status");--> statement-breakpoint
CREATE INDEX "page_translation_states_group_idx" ON "page_translation_states" USING btree ("translation_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_space_id_path_locale_index" ON "pages" USING btree ("space_id","path","locale");--> statement-breakpoint
CREATE INDEX "pages_space_id_index" ON "pages" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "pages_space_id_current_published_version_id_index" ON "pages" USING btree ("space_id","current_published_version_id") WHERE "pages"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "pages_translation_group_locale_unique" ON "pages" USING btree ("translation_group_id","locale") WHERE "pages"."translation_group_id" is not null;--> statement-breakpoint
CREATE INDEX "pages_source_page_idx" ON "pages" USING btree ("source_page_id");--> statement-breakpoint
CREATE INDEX "pages_link_target_page_idx" ON "pages" USING btree ("link_target_page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_categories_slug_unique" ON "raw_categories" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_categories_name_unique" ON "raw_categories" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_categories_single_default" ON "raw_categories" USING btree ("is_default") WHERE "raw_categories"."is_default" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "raw_categories_system_key_unique" ON "raw_categories" USING btree ("system_key") WHERE "raw_categories"."system_key" is not null;--> statement-breakpoint
CREATE INDEX "search_behaviors_search_record_id_created_at_index" ON "search_behaviors" USING btree ("search_record_id","created_at");--> statement-breakpoint
CREATE INDEX "search_behaviors_actor_user_id_created_at_index" ON "search_behaviors" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "search_behaviors_action_created_at_index" ON "search_behaviors" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "search_behaviors_page_id_created_at_index" ON "search_behaviors" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "search_engine_runs_record_capability_unique" ON "search_engine_runs" USING btree ("search_record_id","capability_id");--> statement-breakpoint
CREATE INDEX "search_engine_runs_state_updated_at_index" ON "search_engine_runs" USING btree ("state","updated_at");--> statement-breakpoint
CREATE INDEX "search_engine_runs_search_record_id_updated_at_index" ON "search_engine_runs" USING btree ("search_record_id","updated_at");--> statement-breakpoint
CREATE INDEX "search_records_session_id_created_at_index" ON "search_records" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "search_records_actor_user_id_created_at_index" ON "search_records" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "search_records_space_id_created_at_index" ON "search_records" USING btree ("space_id","created_at");--> statement-breakpoint
CREATE INDEX "search_records_created_at_index" ON "search_records" USING btree ("created_at");--> statement-breakpoint
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
CREATE INDEX "tag_mutations_tag_id_status_index" ON "tag_mutations" USING btree ("tag_id","status");--> statement-breakpoint
CREATE INDEX "tag_mutations_requested_by_created_at_index" ON "tag_mutations" USING btree ("requested_by","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_space_id_normalized_name_index" ON "tags" USING btree ("space_id","normalized_name") WHERE "tags"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tags_space_id_deleted_at_index" ON "tags" USING btree ("space_id","deleted_at");--> statement-breakpoint
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
CREATE UNIQUE INDEX "translation_prompt_versions_unique" ON "translation_prompt_versions" USING btree ("template_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_run_items_source_unique" ON "translation_run_items" USING btree ("run_id","source_page_id");--> statement-breakpoint
CREATE INDEX "translation_run_items_pending_idx" ON "translation_run_items" USING btree ("run_id","status","available_at");--> statement-breakpoint
CREATE INDEX "translation_run_items_source_page_idx" ON "translation_run_items" USING btree ("source_page_id");--> statement-breakpoint
CREATE INDEX "translation_runs_locale_queued_idx" ON "translation_runs" USING btree ("target_locale","queued_at");--> statement-breakpoint
CREATE INDEX "translation_runs_status_queued_idx" ON "translation_runs" USING btree ("status","queued_at");--> statement-breakpoint
CREATE INDEX "translation_runs_actor_queued_idx" ON "translation_runs" USING btree ("actor_user_id","queued_at");--> statement-breakpoint
CREATE INDEX "translation_runs_model_queued_idx" ON "translation_runs" USING btree ("model_id","queued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_runs_active_language_unique" ON "translation_runs" USING btree ("active_language_slot");--> statement-breakpoint
CREATE INDEX "users_email_index" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "outbound_request_logs_created_order_idx" ON "outbound_request_logs" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "outbound_request_logs_source_created_idx" ON "outbound_request_logs" USING btree ("source_type","created_at","id");--> statement-breakpoint
CREATE INDEX "outbound_request_logs_provider_created_idx" ON "outbound_request_logs" USING btree ("provider_key","created_at","id");--> statement-breakpoint
CREATE INDEX "outbound_request_logs_operation_created_idx" ON "outbound_request_logs" USING btree ("operation","created_at","id");--> statement-breakpoint
CREATE INDEX "outbound_request_logs_outcome_created_idx" ON "outbound_request_logs" USING btree ("outcome","created_at","id");--> statement-breakpoint
CREATE INDEX "outbound_request_logs_status_created_idx" ON "outbound_request_logs" USING btree ("status_code","created_at","id");--> statement-breakpoint
CREATE INDEX "outbound_request_logs_correlation_created_idx" ON "outbound_request_logs" USING btree ("correlation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "outbound_request_logs_expires_idx" ON "outbound_request_logs" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_file_revisions_unique" ON "skill_file_revisions" USING btree ("skill_id","path","revision");--> statement-breakpoint
CREATE INDEX "skill_file_revisions_skill_created_idx" ON "skill_file_revisions" USING btree ("skill_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_files_skill_path_unique" ON "skill_files" USING btree ("skill_id","path");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_name_unique" ON "skills" USING btree ("name") WHERE "skills"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "skills_source_idx" ON "skills" USING btree ("source");
