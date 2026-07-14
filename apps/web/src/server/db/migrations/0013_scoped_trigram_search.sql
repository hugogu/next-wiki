-- Custom SQL migration file, put your code below! --
CREATE EXTENSION IF NOT EXISTS btree_gin;--> statement-breakpoint
CREATE INDEX "pages_space_title_trgm_idx"
ON "pages" USING gin ("space_id" uuid_ops, "title" gin_trgm_ops)
WHERE "deleted_at" IS NULL AND "current_published_version_id" IS NOT NULL;
