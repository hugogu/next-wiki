CREATE TABLE "page_ai_attribution_clearances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"previous_level" text NOT NULL,
	"cleared_by_user_id" uuid NOT NULL,
	"cleared_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_ai_attribution_clearances_previous_level_check" CHECK ("page_ai_attribution_clearances"."previous_level" in ('generated', 'assisted')),
	CONSTRAINT "page_ai_attribution_clearances_version_positive" CHECK ("page_ai_attribution_clearances"."version_number" > 0)
);
--> statement-breakpoint
ALTER TABLE "page_ai_attribution_clearances" ADD CONSTRAINT "page_ai_attribution_clearances_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_ai_attribution_clearances" ADD CONSTRAINT "page_ai_attribution_clearances_revision_id_page_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_ai_attribution_clearances" ADD CONSTRAINT "page_ai_attribution_clearances_cleared_by_user_id_users_id_fk" FOREIGN KEY ("cleared_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "page_ai_attribution_clearances_page_version_unique" ON "page_ai_attribution_clearances" USING btree ("page_id","version_number");--> statement-breakpoint
CREATE INDEX "page_ai_attribution_clearances_cleared_at_idx" ON "page_ai_attribution_clearances" USING btree ("cleared_at");