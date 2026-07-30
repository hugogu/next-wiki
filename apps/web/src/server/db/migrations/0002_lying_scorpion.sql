CREATE TYPE "public"."scheduled_ai_job_run_status" AS ENUM('queued', 'running', 'completed', 'failed', 'blocked', 'cancelled', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."scheduled_ai_job_status" AS ENUM('enabled', 'paused', 'retired');--> statement-breakpoint
CREATE TYPE "public"."scheduled_ai_job_trigger" AS ENUM('schedule', 'manual', 'recovery');--> statement-breakpoint
ALTER TYPE "public"."ai_action_feature" ADD VALUE 'scheduled_ai_job' BEFORE 'text_optimization';--> statement-breakpoint
CREATE TABLE "scheduled_ai_job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"trigger" "scheduled_ai_job_trigger" NOT NULL,
	"scheduled_for" timestamp with time zone,
	"definition_version" integer NOT NULL,
	"definition_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"run_as_user_id" uuid,
	"status" "scheduled_ai_job_run_status" DEFAULT 'queued' NOT NULL,
	"ai_action_id" uuid,
	"tool_workflow_id" uuid,
	"result_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	"error_message" text,
	"error_detail" text,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "scheduled_ai_job_runs_definition_version_positive" CHECK ("scheduled_ai_job_runs"."definition_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "scheduled_ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"task_description" text NOT NULL,
	"schedule_cron" text NOT NULL,
	"time_zone" text NOT NULL,
	"target_scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"run_as_user_id" uuid NOT NULL,
	"status" "scheduled_ai_job_status" DEFAULT 'paused' NOT NULL,
	"definition_version" integer DEFAULT 1 NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "scheduled_ai_jobs_definition_version_positive" CHECK ("scheduled_ai_jobs"."definition_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "ai_tool_change_proposals" ADD COLUMN "scheduled_ai_job_run_id" uuid;--> statement-breakpoint
ALTER TABLE "scheduled_ai_job_runs" ADD CONSTRAINT "scheduled_ai_job_runs_job_id_scheduled_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."scheduled_ai_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_ai_job_runs" ADD CONSTRAINT "scheduled_ai_job_runs_run_as_user_id_users_id_fk" FOREIGN KEY ("run_as_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_ai_job_runs" ADD CONSTRAINT "scheduled_ai_job_runs_ai_action_id_ai_actions_id_fk" FOREIGN KEY ("ai_action_id") REFERENCES "public"."ai_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_ai_jobs" ADD CONSTRAINT "scheduled_ai_jobs_run_as_user_id_users_id_fk" FOREIGN KEY ("run_as_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_ai_jobs" ADD CONSTRAINT "scheduled_ai_jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_ai_jobs" ADD CONSTRAINT "scheduled_ai_jobs_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_ai_job_runs_occurrence_unique" ON "scheduled_ai_job_runs" USING btree ("job_id","scheduled_for") WHERE "scheduled_ai_job_runs"."scheduled_for" is not null;--> statement-breakpoint
CREATE INDEX "scheduled_ai_job_runs_job_queued_idx" ON "scheduled_ai_job_runs" USING btree ("job_id","queued_at");--> statement-breakpoint
CREATE INDEX "scheduled_ai_job_runs_recovery_idx" ON "scheduled_ai_job_runs" USING btree ("status","queued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_ai_job_runs_active_job_unique" ON "scheduled_ai_job_runs" USING btree ("job_id") WHERE "scheduled_ai_job_runs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_ai_jobs_normalized_name_unique" ON "scheduled_ai_jobs" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "scheduled_ai_jobs_due_idx" ON "scheduled_ai_jobs" USING btree ("next_run_at") WHERE "scheduled_ai_jobs"."status" = 'enabled';--> statement-breakpoint
CREATE INDEX "scheduled_ai_jobs_owner_idx" ON "scheduled_ai_jobs" USING btree ("run_as_user_id");--> statement-breakpoint
ALTER TABLE "ai_tool_change_proposals" ADD CONSTRAINT "ai_tool_change_proposals_scheduled_ai_job_run_id_scheduled_ai_job_runs_id_fk" FOREIGN KEY ("scheduled_ai_job_run_id") REFERENCES "public"."scheduled_ai_job_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_tool_change_proposals_scheduled_run_idx" ON "ai_tool_change_proposals" USING btree ("scheduled_ai_job_run_id");