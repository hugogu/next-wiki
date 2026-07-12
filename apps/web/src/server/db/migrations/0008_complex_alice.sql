CREATE TYPE "public"."tag_mutation_kind" AS ENUM('rename', 'delete');--> statement-breakpoint
CREATE TYPE "public"."tag_mutation_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
ALTER TYPE "public"."api_key_scope" ADD VALUE 'manage_tags' BEFORE 'ai.read';--> statement-breakpoint
CREATE TABLE "page_revision_metadata" (
	"revision_id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"metadata_date" date,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_revision_tags" (
	"revision_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"tag_name" text NOT NULL,
	"normalized_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_mutations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_id" uuid NOT NULL,
	"kind" "tag_mutation_kind" NOT NULL,
	"status" "tag_mutation_status" DEFAULT 'queued' NOT NULL,
	"requested_name" text,
	"requested_by" uuid,
	"affected_page_count" integer,
	"failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "page_revision_metadata" ADD CONSTRAINT "page_revision_metadata_revision_id_page_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revision_tags" ADD CONSTRAINT "page_revision_tags_revision_id_page_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revision_tags" ADD CONSTRAINT "page_revision_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_mutations" ADD CONSTRAINT "tag_mutations_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_mutations" ADD CONSTRAINT "tag_mutations_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "page_revision_tags_revision_id_tag_id_index" ON "page_revision_tags" USING btree ("revision_id","tag_id");--> statement-breakpoint
CREATE INDEX "page_revision_tags_tag_id_index" ON "page_revision_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "tag_mutations_tag_id_status_index" ON "tag_mutations" USING btree ("tag_id","status");--> statement-breakpoint
CREATE INDEX "tag_mutations_requested_by_created_at_index" ON "tag_mutations" USING btree ("requested_by","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_space_id_normalized_name_index" ON "tags" USING btree ("space_id","normalized_name") WHERE "tags"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tags_space_id_deleted_at_index" ON "tags" USING btree ("space_id","deleted_at");