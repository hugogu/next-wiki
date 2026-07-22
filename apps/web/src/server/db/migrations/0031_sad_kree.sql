CREATE TYPE "public"."ai_tool_activation_status" AS ENUM('available', 'disabled', 'unsupported', 'future_external');--> statement-breakpoint
CREATE TYPE "public"."ai_tool_call_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'blocked', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ai_tool_category" AS ENUM('read', 'page_draft', 'metadata', 'tag', 'batch', 'raw_evidence');--> statement-breakpoint
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
ALTER TYPE "public"."ai_action_feature" ADD VALUE 'wiki_tool_chat';--> statement-breakpoint
ALTER TYPE "public"."ai_capability" ADD VALUE 'tool_calling';--> statement-breakpoint
ALTER TYPE "public"."ai_event_type" ADD VALUE 'tool_call';--> statement-breakpoint
ALTER TYPE "public"."ai_event_type" ADD VALUE 'tool_proposal';--> statement-breakpoint
ALTER TYPE "public"."ai_event_type" ADD VALUE 'tool_evidence';--> statement-breakpoint
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
	"max_calls_per_turn" integer DEFAULT 8 NOT NULL,
	"timeout_ms" integer DEFAULT 30000 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_tool_policies_bounds" CHECK ("ai_tool_policies"."max_calls_per_turn" >= 1 and "ai_tool_policies"."max_calls_per_turn" <= 50 and "ai_tool_policies"."timeout_ms" >= 1000 and "ai_tool_policies"."timeout_ms" <= 120000)
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
	"max_calls" integer DEFAULT 8 NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
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
CREATE INDEX "ai_tool_workflows_status_idx" ON "ai_tool_workflows" USING btree ("status");