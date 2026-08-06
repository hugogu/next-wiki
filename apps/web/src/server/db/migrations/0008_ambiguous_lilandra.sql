CREATE TYPE "public"."cross_space_migration_item_status" AS ENUM('pending', 'running', 'moved', 'excluded', 'conflicted', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."cross_space_migration_status" AS ENUM('previewed', 'queued', 'running', 'completed', 'completed_with_warnings', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "cross_space_migration_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"migration_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"source_path" text NOT NULL,
	"destination_path" text NOT NULL,
	"locale" text NOT NULL,
	"status" "cross_space_migration_item_status" DEFAULT 'pending' NOT NULL,
	"warning" text,
	"failure" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cross_space_migrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by" uuid NOT NULL,
	"source_space_id" uuid NOT NULL,
	"destination_space_id" uuid NOT NULL,
	"selection_kind" text NOT NULL,
	"selection_path" text,
	"selection_page_id" uuid,
	"destination_path_prefix" text,
	"visibility" "page_visibility",
	"adapt_okf" boolean DEFAULT true NOT NULL,
	"fingerprint" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"status" "cross_space_migration_status" DEFAULT 'previewed' NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"failure" text,
	"cancellation_requested_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cross_space_migration_items" ADD CONSTRAINT "cross_space_migration_items_migration_id_cross_space_migrations_id_fk" FOREIGN KEY ("migration_id") REFERENCES "public"."cross_space_migrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_space_migration_items" ADD CONSTRAINT "cross_space_migration_items_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_space_migrations" ADD CONSTRAINT "cross_space_migrations_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_space_migrations" ADD CONSTRAINT "cross_space_migrations_source_space_id_spaces_id_fk" FOREIGN KEY ("source_space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_space_migrations" ADD CONSTRAINT "cross_space_migrations_destination_space_id_spaces_id_fk" FOREIGN KEY ("destination_space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_space_migrations" ADD CONSTRAINT "cross_space_migrations_selection_page_id_pages_id_fk" FOREIGN KEY ("selection_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cross_space_migration_items_migration_ordinal_unique" ON "cross_space_migration_items" USING btree ("migration_id","ordinal");--> statement-breakpoint
CREATE INDEX "cross_space_migration_items_migration_status_idx" ON "cross_space_migration_items" USING btree ("migration_id","status","ordinal");--> statement-breakpoint
CREATE INDEX "cross_space_migration_items_page_idx" ON "cross_space_migration_items" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "cross_space_migrations_status_idx" ON "cross_space_migrations" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "cross_space_migrations_requester_idx" ON "cross_space_migrations" USING btree ("requested_by","created_at");--> statement-breakpoint
CREATE INDEX "cross_space_migrations_preview_expiry_idx" ON "cross_space_migrations" USING btree ("expires_at");