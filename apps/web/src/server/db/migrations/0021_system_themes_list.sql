-- Replace the single-CSS system theme with a list of named themes +
-- an active pointer. Clean break: any saved CSS is dropped.

CREATE TABLE "system_themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"css" text DEFAULT '' NOT NULL,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "system_themes_name_idx" ON "system_themes" USING btree ("name");--> statement-breakpoint
ALTER TABLE "system_themes" ADD CONSTRAINT "system_themes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_theme_settings" ADD COLUMN "active_theme_id" uuid;--> statement-breakpoint
ALTER TABLE "system_theme_settings" ADD CONSTRAINT "system_theme_settings_active_theme_id_system_themes_id_fk" FOREIGN KEY ("active_theme_id") REFERENCES "public"."system_themes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_theme_settings" DROP COLUMN "css";
