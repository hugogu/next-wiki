CREATE TYPE "public"."agent_memory_capture_kind" AS ENUM('turn', 'checkpoint', 'compaction', 'session_end');--> statement-breakpoint
CREATE TYPE "public"."agent_memory_connection_state" AS ENUM('active', 'disabled', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."agent_memory_content_kind" AS ENUM('original', 'generated');--> statement-breakpoint
CREATE TYPE "public"."agent_memory_destination_role" AS ENUM('private', 'shared');--> statement-breakpoint
CREATE TYPE "public"."agent_memory_grant_capability" AS ENUM('read');--> statement-breakpoint
CREATE TYPE "public"."agent_memory_grant_state" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."agent_memory_origin" AS ENUM('explicit_save', 'automatic_capture', 'checkpoint', 'import', 'promotion');--> statement-breakpoint
ALTER TYPE "public"."agent_memory_evidence_relation" ADD VALUE 'promotion';--> statement-breakpoint
ALTER TYPE "public"."agent_memory_evidence_relation" ADD VALUE 'import';--> statement-breakpoint
CREATE TABLE "agent_memory_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"private_namespace_id" uuid NOT NULL,
	"agent_identity" text NOT NULL,
	"display_name" text NOT NULL,
	"state" "agent_memory_connection_state" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "agent_memory_connections_private_namespace_id_unique" UNIQUE("private_namespace_id")
);
--> statement-breakpoint
CREATE TABLE "agent_memory_destination_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grantee_connection_id" uuid NOT NULL,
	"destination_id" uuid NOT NULL,
	"capability" "agent_memory_grant_capability" DEFAULT 'read' NOT NULL,
	"state" "agent_memory_grant_state" DEFAULT 'active' NOT NULL,
	"granted_by_user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_memory_captures" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_memory_captures" ADD COLUMN "capture_kind" "agent_memory_capture_kind" DEFAULT 'turn' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_memory_captures" ADD COLUMN "payload_encrypted" text;--> statement-breakpoint
ALTER TABLE "agent_memory_captures" ADD COLUMN "payload_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_memory_key_bindings" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_memory_namespaces" ADD COLUMN "role" "agent_memory_destination_role" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_memory_records" ADD COLUMN "author_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_memory_records" ADD COLUMN "origin" "agent_memory_origin";--> statement-breakpoint
ALTER TABLE "agent_memory_records" ADD COLUMN "content_kind" "agent_memory_content_kind" DEFAULT 'original' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_memory_connections" ADD CONSTRAINT "agent_memory_connections_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_connections" ADD CONSTRAINT "agent_memory_connections_private_namespace_id_agent_memory_namespaces_id_fk" FOREIGN KEY ("private_namespace_id") REFERENCES "public"."agent_memory_namespaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_destination_grants" ADD CONSTRAINT "agent_memory_destination_grants_grantee_connection_id_agent_memory_connections_id_fk" FOREIGN KEY ("grantee_connection_id") REFERENCES "public"."agent_memory_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_destination_grants" ADD CONSTRAINT "agent_memory_destination_grants_destination_id_agent_memory_namespaces_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."agent_memory_namespaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_destination_grants" ADD CONSTRAINT "agent_memory_destination_grants_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_memory_connections_owner_created_idx" ON "agent_memory_connections" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memory_destination_grants_unique" ON "agent_memory_destination_grants" USING btree ("grantee_connection_id","destination_id","capability");--> statement-breakpoint
CREATE INDEX "agent_memory_destination_grants_destination_idx" ON "agent_memory_destination_grants" USING btree ("destination_id");--> statement-breakpoint
ALTER TABLE "agent_memory_captures" ADD CONSTRAINT "agent_memory_captures_connection_id_agent_memory_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."agent_memory_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_key_bindings" ADD CONSTRAINT "agent_memory_key_bindings_connection_id_agent_memory_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."agent_memory_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_records" ADD CONSTRAINT "agent_memory_records_author_connection_id_agent_memory_connections_id_fk" FOREIGN KEY ("author_connection_id") REFERENCES "public"."agent_memory_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_memory_key_bindings_connection_idx" ON "agent_memory_key_bindings" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memory_records_connection_idempotency_unique" ON "agent_memory_records" USING btree ("author_connection_id","idempotency_key");