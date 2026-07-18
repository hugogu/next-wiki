CREATE TYPE "public"."actor_kind" AS ENUM('human', 'machine');--> statement-breakpoint
CREATE TYPE "public"."content_nature" AS ENUM('original', 'generated');--> statement-breakpoint
CREATE TYPE "public"."page_kind" AS ENUM('native', 'link');--> statement-breakpoint
CREATE TYPE "public"."page_visibility" AS ENUM('public', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."space_kind" AS ENUM('wiki', 'raw', 'generated');--> statement-breakpoint
CREATE TYPE "public"."writing_mode" AS ENUM('copilot', 'llm-wiki');--> statement-breakpoint
CREATE TABLE "writing_mode_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"mode" "writing_mode" DEFAULT 'copilot' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "writing_mode_settings_singleton_id" CHECK ("writing_mode_settings"."id" = 'default')
);
--> statement-breakpoint
ALTER TABLE "page_revisions" ADD COLUMN "actor_kind" "actor_kind" DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "kind" "page_kind" DEFAULT 'native' NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "link_target_page_id" uuid;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "nature" "content_nature" DEFAULT 'original' NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "visibility" "page_visibility" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "kind" "space_kind" DEFAULT 'wiki' NOT NULL;--> statement-breakpoint
ALTER TABLE "writing_mode_settings" ADD CONSTRAINT "writing_mode_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pages_link_target_page_idx" ON "pages" USING btree ("link_target_page_id");