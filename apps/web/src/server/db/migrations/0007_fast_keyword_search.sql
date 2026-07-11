CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "pages_keyword_fts_idx"
ON "pages" USING gin (to_tsvector('simple', coalesce("path", '') || ' ' || coalesce("title", '')));

CREATE INDEX IF NOT EXISTS "page_revisions_content_fts_idx"
ON "page_revisions" USING gin (to_tsvector('simple', coalesce("content_source", '')));

CREATE INDEX IF NOT EXISTS "pages_path_trgm_idx"
ON "pages" USING gin ("path" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "pages_title_trgm_idx"
ON "pages" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "page_revisions_content_source_trgm_idx"
ON "page_revisions" USING gin ("content_source" gin_trgm_ops);
