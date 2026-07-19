CREATE TABLE "raw_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_retired" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "page_revisions" ALTER COLUMN "content_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "page_revisions" ALTER COLUMN "content_type" SET DEFAULT 'text/markdown';--> statement-breakpoint
ALTER TABLE "page_revisions" ADD COLUMN "original_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "raw_category_id" uuid;--> statement-breakpoint
ALTER TABLE "raw_categories" ADD CONSTRAINT "raw_categories_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "raw_categories_slug_unique" ON "raw_categories" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_categories_name_unique" ON "raw_categories" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_categories_single_default" ON "raw_categories" USING btree ("is_default") WHERE "raw_categories"."is_default" = true;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_original_asset_id_content_assets_id_fk" FOREIGN KEY ("original_asset_id") REFERENCES "public"."content_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_raw_category_id_raw_categories_id_fk" FOREIGN KEY ("raw_category_id") REFERENCES "public"."raw_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_revisions_original_asset_idx" ON "page_revisions" USING btree ("original_asset_id");--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_content_type_grammar" CHECK ("page_revisions"."content_type" ~ '^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$');--> statement-breakpoint
DROP TYPE "public"."content_type";