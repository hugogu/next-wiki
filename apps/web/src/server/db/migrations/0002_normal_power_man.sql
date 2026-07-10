ALTER TYPE "public"."transfer_run_status" ADD VALUE 'paused' BEFORE 'completed';--> statement-breakpoint
ALTER TABLE "transfer_runs" ADD COLUMN "pause_requested" boolean DEFAULT false NOT NULL;