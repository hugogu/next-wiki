ALTER TABLE "content_assets" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "content_assets" ALTER COLUMN "kind" SET DEFAULT 'image';--> statement-breakpoint
DROP TYPE "public"."content_asset_kind";