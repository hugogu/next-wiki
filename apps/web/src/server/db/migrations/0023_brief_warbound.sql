CREATE TYPE "public"."agent_memory_binding_purpose" AS ENUM('memory_provider', 'mirror', 'knowledge_search');--> statement-breakpoint
ALTER TYPE "public"."agent_memory_record_type" ADD VALUE 'source_document';--> statement-breakpoint
ALTER TABLE "agent_memory_key_bindings" ADD COLUMN "binding_purpose" "agent_memory_binding_purpose" DEFAULT 'memory_provider' NOT NULL;