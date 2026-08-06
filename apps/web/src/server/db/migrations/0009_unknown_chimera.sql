ALTER TYPE "public"."api_key_scope" ADD VALUE 'attachments';--> statement-breakpoint
CREATE TABLE "attachment_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"max_size_bytes" integer DEFAULT 20971520 NOT NULL,
	"allowed_categories" text[] DEFAULT '{"image","video","document"}' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" uuid
);
--> statement-breakpoint
ALTER TABLE "attachment_settings" ADD CONSTRAINT "attachment_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_attachments" ADD CONSTRAINT "page_attachments_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_attachments" ADD CONSTRAINT "page_attachments_asset_id_content_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."content_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_attachments" ADD CONSTRAINT "page_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_attachments" ADD CONSTRAINT "page_attachments_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_attachments_page_idx" ON "page_attachments" USING btree ("page_id") WHERE "page_attachments"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "page_attachments_asset_idx" ON "page_attachments" USING btree ("asset_id");