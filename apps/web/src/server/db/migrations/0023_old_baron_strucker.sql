ALTER TABLE "page_revisions" ADD COLUMN "source_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD COLUMN "link_target_page_id" uuid;--> statement-breakpoint
ALTER TABLE "writing_mode_settings" ADD COLUMN "pending_mode" "writing_mode";--> statement-breakpoint
ALTER TABLE "writing_mode_settings" ADD COLUMN "switch_job_id" uuid;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_link_kind_target_pair" CHECK (("pages"."kind" = 'link') = ("pages"."link_target_page_id" is not null));--> statement-breakpoint
ALTER TABLE "writing_mode_settings" ADD CONSTRAINT "writing_mode_settings_switch_pair" CHECK (("writing_mode_settings"."pending_mode" is null) = ("writing_mode_settings"."switch_job_id" is null));