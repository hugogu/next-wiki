ALTER TABLE "pages" ADD COLUMN "write_metadata_to_frontmatter" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Backfill: preserve current behavior for pages whose latest revision already
-- embeds a `---` frontmatter block in its Markdown body (matches the editor's
-- prior `hasEditorFrontmatter` auto-detection). Pages without one keep the
-- default (false).
UPDATE "pages" p
SET "write_metadata_to_frontmatter" = true
FROM "page_revisions" r
WHERE p."latest_version_id" = r."id"
  AND (r."content_source" LIKE E'---\n%' OR r."content_source" LIKE E'---\r\n%');
