CREATE TABLE "markdown_themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid,
	"name" text NOT NULL,
	"css" text NOT NULL,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "active_markdown_theme_id" uuid;--> statement-breakpoint
ALTER TABLE "markdown_themes" ADD CONSTRAINT "markdown_themes_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "markdown_themes_owner_name_idx" ON "markdown_themes" USING btree ("owner_user_id","name");--> statement-breakpoint
CREATE INDEX "markdown_themes_owner_idx" ON "markdown_themes" USING btree ("owner_user_id");