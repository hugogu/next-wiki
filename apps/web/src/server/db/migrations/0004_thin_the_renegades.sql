CREATE TYPE "public"."search_behavior_action" AS ENUM('result_open', 'escape');--> statement-breakpoint
CREATE TABLE "search_behaviors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"search_record_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" "search_behavior_action" NOT NULL,
	"page_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"session_id" uuid NOT NULL,
	"query" text NOT NULL,
	"keyword_result_count" integer DEFAULT 0 NOT NULL,
	"semantic_result_count" integer DEFAULT 0 NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"semantic_state" text DEFAULT 'skipped' NOT NULL,
	"semantic_action_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "search_behaviors" ADD CONSTRAINT "search_behaviors_search_record_id_search_records_id_fk" FOREIGN KEY ("search_record_id") REFERENCES "public"."search_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_behaviors" ADD CONSTRAINT "search_behaviors_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_behaviors" ADD CONSTRAINT "search_behaviors_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_records" ADD CONSTRAINT "search_records_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_records" ADD CONSTRAINT "search_records_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_behaviors_search_record_id_created_at_index" ON "search_behaviors" USING btree ("search_record_id","created_at");--> statement-breakpoint
CREATE INDEX "search_behaviors_actor_user_id_created_at_index" ON "search_behaviors" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "search_behaviors_action_created_at_index" ON "search_behaviors" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "search_behaviors_page_id_created_at_index" ON "search_behaviors" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE INDEX "search_records_session_id_created_at_index" ON "search_records" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "search_records_actor_user_id_created_at_index" ON "search_records" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "search_records_space_id_created_at_index" ON "search_records" USING btree ("space_id","created_at");--> statement-breakpoint
CREATE INDEX "search_records_created_at_index" ON "search_records" USING btree ("created_at");