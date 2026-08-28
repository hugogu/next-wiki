CREATE TYPE "public"."agent_memory_capture_status" AS ENUM('queued', 'running', 'durable', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."agent_memory_evidence_relation" AS ENUM('explicit_save', 'automatic_capture', 'checkpoint');--> statement-breakpoint
CREATE TYPE "public"."agent_memory_namespace_state" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."agent_memory_record_state" AS ENUM('active', 'forgotten');--> statement-breakpoint
CREATE TYPE "public"."agent_memory_record_type" AS ENUM('memory', 'evidence');--> statement-breakpoint
ALTER TYPE "public"."api_key_scope" ADD VALUE 'memory.read';--> statement-breakpoint
ALTER TYPE "public"."api_key_scope" ADD VALUE 'memory.write';--> statement-breakpoint
ALTER TYPE "public"."api_key_scope" ADD VALUE 'memory.delete';--> statement-breakpoint
ALTER TYPE "public"."audit_origin" ADD VALUE 'agent_memory';--> statement-breakpoint
CREATE TABLE "agent_memory_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"namespace_id" uuid NOT NULL,
	"api_key_id" uuid NOT NULL,
	"agent_identity" text DEFAULT 'hermes' NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload_digest" text DEFAULT 'legacy' NOT NULL,
	"session_digest" text NOT NULL,
	"checkpoint" boolean DEFAULT false NOT NULL,
	"status" "agent_memory_capture_status" DEFAULT 'queued' NOT NULL,
	"evidence_record_id" uuid,
	"job_id" text,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_memory_evidence_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_record_id" uuid NOT NULL,
	"evidence_record_id" uuid NOT NULL,
	"relation" "agent_memory_evidence_relation" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_memory_key_bindings" (
	"api_key_id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"agent_identity" text DEFAULT 'hermes' NOT NULL,
	"shared_by_owner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_memory_namespaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"state" "agent_memory_namespace_state" DEFAULT 'active' NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_memory_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"namespace_id" uuid NOT NULL,
	"agent_identity" text DEFAULT 'hermes' NOT NULL,
	"record_type" "agent_memory_record_type" NOT NULL,
	"page_id" uuid NOT NULL,
	"current_revision_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"source_session_digest" text,
	"state" "agent_memory_record_state" DEFAULT 'active' NOT NULL,
	"forgotten_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_memory_captures" ADD CONSTRAINT "agent_memory_captures_namespace_id_agent_memory_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."agent_memory_namespaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_captures" ADD CONSTRAINT "agent_memory_captures_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_captures" ADD CONSTRAINT "agent_memory_captures_evidence_record_id_agent_memory_records_id_fk" FOREIGN KEY ("evidence_record_id") REFERENCES "public"."agent_memory_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_evidence_links" ADD CONSTRAINT "agent_memory_evidence_links_memory_record_id_agent_memory_records_id_fk" FOREIGN KEY ("memory_record_id") REFERENCES "public"."agent_memory_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_evidence_links" ADD CONSTRAINT "agent_memory_evidence_links_evidence_record_id_agent_memory_records_id_fk" FOREIGN KEY ("evidence_record_id") REFERENCES "public"."agent_memory_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_key_bindings" ADD CONSTRAINT "agent_memory_key_bindings_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_key_bindings" ADD CONSTRAINT "agent_memory_key_bindings_namespace_id_agent_memory_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."agent_memory_namespaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_namespaces" ADD CONSTRAINT "agent_memory_namespaces_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_records" ADD CONSTRAINT "agent_memory_records_namespace_id_agent_memory_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."agent_memory_namespaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_records" ADD CONSTRAINT "agent_memory_records_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_records" ADD CONSTRAINT "agent_memory_records_current_revision_id_page_revisions_id_fk" FOREIGN KEY ("current_revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memory_captures_namespace_identity_idempotency_unique" ON "agent_memory_captures" USING btree ("namespace_id","agent_identity","idempotency_key");--> statement-breakpoint
CREATE INDEX "agent_memory_captures_api_key_idx" ON "agent_memory_captures" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "agent_memory_captures_status_updated_idx" ON "agent_memory_captures" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memory_evidence_links_unique" ON "agent_memory_evidence_links" USING btree ("memory_record_id","evidence_record_id","relation");--> statement-breakpoint
CREATE INDEX "agent_memory_evidence_links_evidence_idx" ON "agent_memory_evidence_links" USING btree ("evidence_record_id");--> statement-breakpoint
CREATE INDEX "agent_memory_key_bindings_namespace_idx" ON "agent_memory_key_bindings" USING btree ("namespace_id");--> statement-breakpoint
CREATE INDEX "agent_memory_namespaces_owner_created_idx" ON "agent_memory_namespaces" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memory_records_namespace_identity_idempotency_unique" ON "agent_memory_records" USING btree ("namespace_id","agent_identity","idempotency_key");--> statement-breakpoint
CREATE INDEX "agent_memory_records_namespace_state_updated_idx" ON "agent_memory_records" USING btree ("namespace_id","state","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memory_records_page_unique" ON "agent_memory_records" USING btree ("page_id");