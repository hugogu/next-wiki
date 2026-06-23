CREATE TABLE "appearance_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"light_colors" jsonb NOT NULL,
	"dark_colors" jsonb NOT NULL,
	"fonts" jsonb NOT NULL,
	"font_sizes" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appearance_settings" ADD CONSTRAINT "appearance_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;