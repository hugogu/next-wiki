CREATE TYPE "public"."outbound_request_outcome" AS ENUM('success', 'http_error', 'transport_error', 'timeout', 'cancelled', 'invalid_response');--> statement-breakpoint
CREATE TYPE "public"."request_log_level" AS ENUM('status', 'header', 'all');--> statement-breakpoint
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
ALTER TABLE "api_audit_entries" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "request_log_settings" ADD CONSTRAINT "request_log_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbound_request_logs_created_order_idx" ON "outbound_request_logs" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "outbound_request_logs_source_created_idx" ON "outbound_request_logs" USING btree ("source_type","created_at","id");--> statement-breakpoint
CREATE INDEX "outbound_request_logs_provider_created_idx" ON "outbound_request_logs" USING btree ("provider_key","created_at","id");--> statement-breakpoint
CREATE INDEX "outbound_request_logs_operation_created_idx" ON "outbound_request_logs" USING btree ("operation","created_at","id");--> statement-breakpoint
CREATE INDEX "outbound_request_logs_outcome_created_idx" ON "outbound_request_logs" USING btree ("outcome","created_at","id");--> statement-breakpoint
CREATE INDEX "outbound_request_logs_status_created_idx" ON "outbound_request_logs" USING btree ("status_code","created_at","id");--> statement-breakpoint
CREATE INDEX "outbound_request_logs_correlation_created_idx" ON "outbound_request_logs" USING btree ("correlation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "outbound_request_logs_expires_idx" ON "outbound_request_logs" USING btree ("expires_at");