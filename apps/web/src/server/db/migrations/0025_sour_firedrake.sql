ALTER TABLE "page_ai_attribution_clearances" DROP CONSTRAINT "page_ai_attribution_clearances_previous_level_check";--> statement-breakpoint
DROP INDEX "page_ai_attribution_clearances_page_version_unique";--> statement-breakpoint
ALTER TABLE "page_ai_attribution_clearances" ALTER COLUMN "previous_level" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "page_ai_attribution_clearances" ADD COLUMN "operation" text DEFAULT 'clear' NOT NULL;--> statement-breakpoint
ALTER TABLE "page_ai_attribution_clearances" ADD COLUMN "level" text;--> statement-breakpoint
CREATE INDEX "page_ai_attribution_clearances_page_version_idx" ON "page_ai_attribution_clearances" USING btree ("page_id","version_number");--> statement-breakpoint
ALTER TABLE "page_ai_attribution_clearances" ADD CONSTRAINT "page_ai_attribution_clearances_operation_check" CHECK (("page_ai_attribution_clearances"."operation" = 'clear' and "page_ai_attribution_clearances"."level" is null and "page_ai_attribution_clearances"."previous_level" in ('generated', 'assisted')) or ("page_ai_attribution_clearances"."operation" = 'set' and "page_ai_attribution_clearances"."level" in ('generated', 'assisted')));