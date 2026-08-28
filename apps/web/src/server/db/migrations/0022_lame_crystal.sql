CREATE TYPE "public"."agent_memory_connection_state" AS ENUM('active', 'disabled', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."agent_memory_destination_role" AS ENUM('private', 'shared');--> statement-breakpoint
CREATE TYPE "public"."agent_memory_grant_capability" AS ENUM('read', 'write');--> statement-breakpoint
CREATE TYPE "public"."agent_memory_grant_state" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."agent_memory_record_origin" AS ENUM('explicit_save', 'automatic_capture', 'checkpoint', 'import', 'promotion');--> statement-breakpoint
CREATE TYPE "public"."agent_memory_record_role" AS ENUM('evidence', 'synthesis', 'curated');--> statement-breakpoint
ALTER TYPE "public"."agent_memory_evidence_relation" ADD VALUE 'promotion';--> statement-breakpoint
ALTER TYPE "public"."agent_memory_record_state" ADD VALUE 'archived';--> statement-breakpoint
CREATE TABLE "agent_memory_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"namespace_id" uuid NOT NULL,
	"agent_identity" text NOT NULL,
	"display_label" text NOT NULL,
	"state" "agent_memory_connection_state" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_memory_destination_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grantee_connection_id" uuid NOT NULL,
	"destination_id" uuid NOT NULL,
	"capability" "agent_memory_grant_capability" NOT NULL,
	"state" "agent_memory_grant_state" DEFAULT 'active' NOT NULL,
	"granted_by_user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_memory_retention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"destination_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"retention_days" integer DEFAULT 365 NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "agent_memory_records_namespace_identity_idempotency_unique";--> statement-breakpoint
ALTER TABLE "agent_memory_captures" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_memory_captures" ADD COLUMN "payload_encrypted" text;--> statement-breakpoint
ALTER TABLE "agent_memory_captures" ADD COLUMN "capture_kind" text DEFAULT 'session' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_memory_key_bindings" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_memory_namespaces" ADD COLUMN "role" "agent_memory_destination_role" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_memory_records" ADD COLUMN "author_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_memory_records" ADD COLUMN "record_role" "agent_memory_record_role" DEFAULT 'synthesis' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_memory_records" ADD COLUMN "origin" "agent_memory_record_origin" DEFAULT 'explicit_save' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_memory_connections" ADD CONSTRAINT "agent_memory_connections_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_connections" ADD CONSTRAINT "agent_memory_connections_namespace_id_agent_memory_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."agent_memory_namespaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_destination_grants" ADD CONSTRAINT "agent_memory_destination_grants_grantee_connection_id_agent_memory_connections_id_fk" FOREIGN KEY ("grantee_connection_id") REFERENCES "public"."agent_memory_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_destination_grants" ADD CONSTRAINT "agent_memory_destination_grants_destination_id_agent_memory_namespaces_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."agent_memory_namespaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_destination_grants" ADD CONSTRAINT "agent_memory_destination_grants_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_retention_policies" ADD CONSTRAINT "agent_memory_retention_policies_destination_id_agent_memory_namespaces_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."agent_memory_namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_retention_policies" ADD CONSTRAINT "agent_memory_retention_policies_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_memory_connections_owner_created_idx" ON "agent_memory_connections" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memory_connections_namespace_unique" ON "agent_memory_connections" USING btree ("namespace_id");--> statement-breakpoint
CREATE INDEX "agent_memory_destination_grants_grantee_capability_idx" ON "agent_memory_destination_grants" USING btree ("grantee_connection_id","capability","state");--> statement-breakpoint
CREATE INDEX "agent_memory_destination_grants_destination_capability_idx" ON "agent_memory_destination_grants" USING btree ("destination_id","capability","state");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memory_destination_grants_unique" ON "agent_memory_destination_grants" USING btree ("grantee_connection_id","destination_id","capability");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memory_retention_policies_destination_unique" ON "agent_memory_retention_policies" USING btree ("destination_id");--> statement-breakpoint
ALTER TABLE "agent_memory_captures" ADD CONSTRAINT "agent_memory_captures_connection_id_agent_memory_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."agent_memory_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_key_bindings" ADD CONSTRAINT "agent_memory_key_bindings_connection_id_agent_memory_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."agent_memory_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_records" ADD CONSTRAINT "agent_memory_records_author_connection_id_agent_memory_connections_id_fk" FOREIGN KEY ("author_connection_id") REFERENCES "public"."agent_memory_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memory_records_namespace_connection_idempotency_unique" ON "agent_memory_records" USING btree ("namespace_id","author_connection_id","idempotency_key");