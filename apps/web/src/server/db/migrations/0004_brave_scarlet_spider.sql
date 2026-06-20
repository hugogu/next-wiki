CREATE TYPE "public"."content_asset_kind" AS ENUM('image');--> statement-breakpoint
CREATE TYPE "public"."migration_status" AS ENUM('pending', 'copying', 'verifying', 'completed', 'failed', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."storage_backend_purpose" AS ENUM('primary', 'git_export');--> statement-breakpoint
CREATE TYPE "public"."storage_backend_type" AS ENUM('database', 'local', 's3', 'git');--> statement-breakpoint
CREATE TABLE "content_asset_refs" (
	"asset_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "content_asset_kind" DEFAULT 'image' NOT NULL,
	"content_hash" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "content_blobs" (
	"asset_id" uuid PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_migrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_backend_id" uuid NOT NULL,
	"target_backend_id" uuid NOT NULL,
	"status" "migration_status" DEFAULT 'pending' NOT NULL,
	"total_items" integer DEFAULT 0 NOT NULL,
	"copied_items" integer DEFAULT 0 NOT NULL,
	"verified_items" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"abort_requested" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "storage_backends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "storage_backend_type" NOT NULL,
	"purpose" "storage_backend_purpose" DEFAULT 'primary' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_encrypted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_revisions" ALTER COLUMN "content_source" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "content_asset_refs" ADD CONSTRAINT "content_asset_refs_asset_id_content_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."content_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_asset_refs" ADD CONSTRAINT "content_asset_refs_revision_id_page_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_blobs" ADD CONSTRAINT "content_blobs_asset_id_content_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."content_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_migrations" ADD CONSTRAINT "content_migrations_source_backend_id_storage_backends_id_fk" FOREIGN KEY ("source_backend_id") REFERENCES "public"."storage_backends"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_migrations" ADD CONSTRAINT "content_migrations_target_backend_id_storage_backends_id_fk" FOREIGN KEY ("target_backend_id") REFERENCES "public"."storage_backends"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_migrations" ADD CONSTRAINT "content_migrations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_asset_refs_pk" ON "content_asset_refs" USING btree ("asset_id","revision_id");--> statement-breakpoint
CREATE INDEX "content_asset_refs_revision_id_index" ON "content_asset_refs" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "content_assets_content_hash_index" ON "content_assets" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "content_assets_deleted_at_index" ON "content_assets" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "content_assets_created_by_index" ON "content_assets" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "content_migrations_status_index" ON "content_migrations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_backends_active_primary" ON "storage_backends" USING btree ("purpose") WHERE "storage_backends"."is_active" = true and "storage_backends"."purpose" = 'primary';--> statement-breakpoint
CREATE UNIQUE INDEX "storage_backends_type_purpose" ON "storage_backends" USING btree ("type","purpose");