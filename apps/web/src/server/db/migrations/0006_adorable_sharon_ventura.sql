CREATE TABLE "page_route_redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_route" text NOT NULL,
	"target_page_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retired_link_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_page_id" uuid NOT NULL,
	"legacy_path" text NOT NULL,
	"target_page_id" uuid NOT NULL,
	"retired_by" uuid,
	"retired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disposition" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "space_route_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"prefix" text NOT NULL,
	"retired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "route_prefix" text;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "default_visibility" "page_visibility";--> statement-breakpoint
ALTER TABLE "page_route_redirects" ADD CONSTRAINT "page_route_redirects_target_page_id_pages_id_fk" FOREIGN KEY ("target_page_id") REFERENCES "public"."pages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retired_link_pages" ADD CONSTRAINT "retired_link_pages_link_page_id_pages_id_fk" FOREIGN KEY ("link_page_id") REFERENCES "public"."pages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retired_link_pages" ADD CONSTRAINT "retired_link_pages_target_page_id_pages_id_fk" FOREIGN KEY ("target_page_id") REFERENCES "public"."pages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retired_link_pages" ADD CONSTRAINT "retired_link_pages_retired_by_users_id_fk" FOREIGN KEY ("retired_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_route_aliases" ADD CONSTRAINT "space_route_aliases_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "page_route_redirects_legacy_route_unique" ON "page_route_redirects" USING btree ("legacy_route");--> statement-breakpoint
CREATE INDEX "page_route_redirects_target_idx" ON "page_route_redirects" USING btree ("target_page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retired_link_pages_link_page_unique" ON "retired_link_pages" USING btree ("link_page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retired_link_pages_legacy_path_unique" ON "retired_link_pages" USING btree ("legacy_path");--> statement-breakpoint
CREATE INDEX "retired_link_pages_target_idx" ON "retired_link_pages" USING btree ("target_page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "space_route_aliases_prefix_unique" ON "space_route_aliases" USING btree ("prefix");--> statement-breakpoint
CREATE INDEX "space_route_aliases_space_idx" ON "space_route_aliases" USING btree ("space_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spaces_route_prefix_unique" ON "spaces" USING btree ("route_prefix") WHERE "spaces"."route_prefix" is not null;