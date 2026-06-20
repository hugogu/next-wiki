CREATE TYPE "public"."storage_object_kind" AS ENUM('markdown', 'image');--> statement-breakpoint
CREATE TYPE "public"."storage_replica_state" AS ENUM('disabled', 'backfilling', 'enabled', 'degraded', 'deleting');--> statement-breakpoint
CREATE TYPE "public"."storage_replication_operation" AS ENUM('upsert', 'delete');--> statement-breakpoint
CREATE TYPE "public"."storage_replication_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
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
DROP INDEX "storage_backends_active_primary";--> statement-breakpoint
ALTER TABLE "storage_backends" ADD COLUMN "replica_state" "storage_replica_state" DEFAULT 'disabled' NOT NULL;--> statement-breakpoint
ALTER TABLE "storage_backends" ADD COLUMN "is_read_preferred" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "storage_backends" ADD COLUMN "sync_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "storage_backends" ADD COLUMN "sync_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "storage_backends" ADD COLUMN "last_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "storage_backends" ADD COLUMN "last_error" text;--> statement-breakpoint
UPDATE "storage_backends"
SET "replica_state" = 'enabled'
WHERE "type" = 'database' AND "purpose" = 'primary';--> statement-breakpoint
UPDATE "storage_backends"
SET "is_active" = ("type" = 'database')
WHERE "purpose" = 'primary';--> statement-breakpoint
ALTER TABLE "storage_replication_tasks" ADD CONSTRAINT "storage_replication_tasks_backend_id_storage_backends_id_fk" FOREIGN KEY ("backend_id") REFERENCES "public"."storage_backends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "storage_replication_tasks_delivery" ON "storage_replication_tasks" USING btree ("backend_id","object_kind","object_id","operation");--> statement-breakpoint
CREATE INDEX "storage_replication_tasks_status_available_at_index" ON "storage_replication_tasks" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "storage_replication_tasks_backend_id_status_index" ON "storage_replication_tasks" USING btree ("backend_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_backends_read_preferred" ON "storage_backends" USING btree ("is_read_preferred") WHERE "storage_backends"."is_read_preferred" = true;
