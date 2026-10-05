DROP INDEX "pages_space_id_path_locale_index";--> statement-breakpoint
ALTER TABLE "cross_space_migration_items" ALTER COLUMN "locale" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "page_revisions" ALTER COLUMN "locale" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "page_revisions" ALTER COLUMN "locale" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ALTER COLUMN "locale" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "pages" ALTER COLUMN "locale" DROP NOT NULL;--> statement-breakpoint
-- `en` was the column default, not a choice anyone made: nothing let a page
-- declare its language, so every original carries it. Clear it so "not set"
-- means what it says. A translation keeps its language (it is the language it
-- is written in), and an original with any other value (for example one
-- imported from Wiki.js) keeps that. Revisions already written keep the
-- placeholder: nothing reads `page_revisions.locale`, and rewriting every
-- revision row is not worth it.
UPDATE "pages" SET "locale" = NULL WHERE "translation_group_id" IS NULL AND "locale" = 'en';--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_space_path_locale_unique" UNIQUE NULLS NOT DISTINCT("space_id","path","locale");--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_translation_has_locale" CHECK ("pages"."translation_group_id" is null or "pages"."locale" is not null);