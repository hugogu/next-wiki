CREATE TYPE "public"."cleanup_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
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
ALTER TABLE "storage_cleanup_jobs" ADD CONSTRAINT "storage_cleanup_jobs_backend_id_storage_backends_id_fk" FOREIGN KEY ("backend_id") REFERENCES "public"."storage_backends"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_cleanup_jobs" ADD CONSTRAINT "storage_cleanup_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storage_cleanup_jobs_backend_id_index" ON "storage_cleanup_jobs" USING btree ("backend_id");--> statement-breakpoint
CREATE INDEX "storage_cleanup_jobs_status_index" ON "storage_cleanup_jobs" USING btree ("status");