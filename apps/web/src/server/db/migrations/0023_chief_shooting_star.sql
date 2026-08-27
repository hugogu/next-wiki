ALTER TYPE "public"."hermes_memory_capture_status" RENAME TO "agent_memory_capture_status";--> statement-breakpoint
ALTER TYPE "public"."hermes_memory_evidence_relation" RENAME TO "agent_memory_evidence_relation";--> statement-breakpoint
ALTER TYPE "public"."hermes_memory_namespace_state" RENAME TO "agent_memory_namespace_state";--> statement-breakpoint
ALTER TYPE "public"."hermes_memory_record_state" RENAME TO "agent_memory_record_state";--> statement-breakpoint
ALTER TYPE "public"."hermes_memory_record_type" RENAME TO "agent_memory_record_type";--> statement-breakpoint
ALTER TYPE "public"."audit_origin" ADD VALUE 'agent_memory' BEFORE 'hermes';--> statement-breakpoint
ALTER TABLE "hermes_memory_captures" RENAME TO "agent_memory_captures";--> statement-breakpoint
ALTER TABLE "hermes_memory_evidence_links" RENAME TO "agent_memory_evidence_links";--> statement-breakpoint
ALTER TABLE "hermes_memory_key_bindings" RENAME TO "agent_memory_key_bindings";--> statement-breakpoint
ALTER TABLE "hermes_memory_namespaces" RENAME TO "agent_memory_namespaces";--> statement-breakpoint
ALTER TABLE "hermes_memory_records" RENAME TO "agent_memory_records";--> statement-breakpoint
ALTER TABLE "agent_memory_captures" DROP CONSTRAINT "hermes_memory_captures_namespace_id_hermes_memory_namespaces_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_memory_captures" DROP CONSTRAINT "hermes_memory_captures_api_key_id_api_keys_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_memory_captures" DROP CONSTRAINT "hermes_memory_captures_evidence_record_id_hermes_memory_records_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_memory_evidence_links" DROP CONSTRAINT "hermes_memory_evidence_links_memory_record_id_hermes_memory_records_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_memory_evidence_links" DROP CONSTRAINT "hermes_memory_evidence_links_evidence_record_id_hermes_memory_records_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_memory_key_bindings" DROP CONSTRAINT "hermes_memory_key_bindings_api_key_id_api_keys_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_memory_key_bindings" DROP CONSTRAINT "hermes_memory_key_bindings_namespace_id_hermes_memory_namespaces_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_memory_namespaces" DROP CONSTRAINT "hermes_memory_namespaces_owner_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_memory_records" DROP CONSTRAINT "hermes_memory_records_namespace_id_hermes_memory_namespaces_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_memory_records" DROP CONSTRAINT "hermes_memory_records_page_id_pages_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_memory_records" DROP CONSTRAINT "hermes_memory_records_current_revision_id_page_revisions_id_fk";
--> statement-breakpoint
DROP INDEX "hermes_memory_captures_namespace_idempotency_unique";--> statement-breakpoint
DROP INDEX "hermes_memory_captures_api_key_idx";--> statement-breakpoint
DROP INDEX "hermes_memory_captures_status_updated_idx";--> statement-breakpoint
DROP INDEX "hermes_memory_evidence_links_unique";--> statement-breakpoint
DROP INDEX "hermes_memory_evidence_links_evidence_idx";--> statement-breakpoint
DROP INDEX "hermes_memory_key_bindings_namespace_idx";--> statement-breakpoint
DROP INDEX "hermes_memory_namespaces_owner_created_idx";--> statement-breakpoint
DROP INDEX "hermes_memory_records_namespace_idempotency_unique";--> statement-breakpoint
DROP INDEX "hermes_memory_records_namespace_state_updated_idx";--> statement-breakpoint
DROP INDEX "hermes_memory_records_page_unique";--> statement-breakpoint
ALTER TABLE "agent_memory_captures" ADD COLUMN "agent_identity" text DEFAULT 'hermes' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_memory_key_bindings" ADD COLUMN "agent_identity" text DEFAULT 'hermes' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_memory_records" ADD COLUMN "agent_identity" text DEFAULT 'hermes' NOT NULL;--> statement-breakpoint
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