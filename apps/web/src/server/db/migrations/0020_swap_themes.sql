DROP TABLE IF EXISTS "markdown_themes";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "active_markdown_theme_id";--> statement-breakpoint
DROP TABLE IF EXISTS "appearance_settings";--> statement-breakpoint
CREATE TABLE "system_theme_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"css" text DEFAULT '' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "system_theme_settings" ADD CONSTRAINT "system_theme_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "user_appearance" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"light_colors" jsonb NOT NULL,
	"dark_colors" jsonb NOT NULL,
	"fonts" jsonb NOT NULL,
	"font_sizes" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "user_appearance" ADD CONSTRAINT "user_appearance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
