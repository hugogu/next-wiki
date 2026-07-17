CREATE TYPE "public"."setup_account_status" AS ENUM('needed', 'created');--> statement-breakpoint
CREATE TYPE "public"."setup_ai_status" AS ENUM('not_started', 'skipped', 'queued', 'running', 'completed', 'partial', 'failed', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."setup_sample_pages_status" AS ENUM('not_started', 'skipped', 'completed', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."setup_step" AS ENUM('account', 'ai', 'sample_pages', 'summary', 'closed');--> statement-breakpoint
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
ALTER TABLE "setup_progress" ADD CONSTRAINT "setup_progress_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_progress" ADD CONSTRAINT "setup_progress_ai_action_id_ai_actions_id_fk" FOREIGN KEY ("ai_action_id") REFERENCES "public"."ai_actions"("id") ON DELETE set null ON UPDATE no action;