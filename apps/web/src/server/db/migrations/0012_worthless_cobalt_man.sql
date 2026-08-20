CREATE TYPE "public"."page_address_kind" AS ENUM('retained', 'manual');--> statement-breakpoint
CREATE TABLE "page_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"address" text NOT NULL,
	"page_id" uuid NOT NULL,
	"kind" "page_address_kind" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_addresses" ADD CONSTRAINT "page_addresses_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_addresses" ADD CONSTRAINT "page_addresses_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "page_addresses_space_address_unique" ON "page_addresses" USING btree ("space_id","address");--> statement-breakpoint
CREATE INDEX "page_addresses_page_idx" ON "page_addresses" USING btree ("page_id");--> statement-breakpoint
-- 035: backfill so every address that was publicly reachable before this
-- feature remains a page's canonical slug (FR-024, SC-001). Non-translation
-- rows, including soft-deleted ones, get slug = path; translation rows own no
-- independent address and are cleared to '' (they resolve as
-- {locale}/{source.slug} instead). MUST run before the unique index below:
-- the pre-035 `slug` column held a per-page leaf segment that was never
-- unique across folders (many "index" pages, one per directory), so creating
-- the index first fails on that legacy data.
UPDATE "pages" SET "slug" = "path" WHERE "translation_group_id" IS NULL;--> statement-breakpoint
UPDATE "pages" SET "slug" = '' WHERE "translation_group_id" IS NOT NULL;--> statement-breakpoint
-- 035: `pages` was previously unique only on (space_id, path, locale), which
-- allowed two independently-authored non-translation originals (no
-- source_page_id/translation_group_id link) to share one path at different
-- locales — e.g. an 'en' and a 'zh' page both at "ai/dl/transfer-learning".
-- The new slug namespace has no locale dimension, so a bare path=slug
-- backfill collides. Only the earliest-created row of such a group keeps the
-- plain path; every later one is disambiguated with its locale so the
-- backfill is deterministic and no live address is reassigned.
WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "space_id", "path" ORDER BY "created_at", "id") AS rn
  FROM "pages"
  WHERE "translation_group_id" IS NULL
)
UPDATE "pages" p SET "slug" = p."path" || '-' || p."locale"
FROM ranked r
WHERE p."id" = r."id" AND r.rn > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "pages_space_slug_unique" ON "pages" USING btree ("space_id","slug") WHERE "pages"."translation_group_id" is null;--> statement-breakpoint
-- 035: convert existing page_route_redirects rows into page_addresses. A
-- legacy_route is a full route ("/wiki/foo/bar" or "/wiki/zh/foo") that is
-- global and prefix-qualified; page_addresses.address is space-scoped and
-- prefix-free, so this strips the leading space-prefix segment before
-- inserting. The prefix is resolved the same way effectiveRoutePrefix() does
-- in application code: the space's own route_prefix when set, otherwise the
-- built-in default for its kind ('wiki' for a wiki-kind space, the kind
-- itself for 'raw'/'generated'). A legacy_route whose prefix resolves to no
-- space is dropped by the join (it was already unroutable dead data). A
-- converted address that collides with a page's now-backfilled canonical slug
-- is dropped by ON CONFLICT DO NOTHING: pre-035, a live page's slug already
-- took precedence over a stale redirect at the same address (see
-- resolveReaderPage: getLive is tried before findPageRouteRedirectTarget), so
-- the redirect was already unreachable and dropping it changes nothing
-- observable.
INSERT INTO "page_addresses" ("space_id", "address", "page_id", "kind", "reason", "created_at")
SELECT "s"."id",
       substring("r"."legacy_route" from position('/' in substring("r"."legacy_route" from 2)) + 2),
       "r"."target_page_id",
       'retained',
       "r"."reason",
       "r"."created_at"
FROM "page_route_redirects" "r"
JOIN "spaces" "s"
  ON split_part("r"."legacy_route", '/', 2) = COALESCE(
       NULLIF(btrim("s"."route_prefix"), ''),
       CASE WHEN "s"."kind" = 'wiki' THEN 'wiki' ELSE "s"."kind"::text END
     )
ON CONFLICT ("space_id", "address") DO NOTHING;