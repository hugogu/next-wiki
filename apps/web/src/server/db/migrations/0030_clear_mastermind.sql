CREATE TYPE "public"."analytics_provider" AS ENUM('baidu_tongji', 'google_analytics');--> statement-breakpoint
CREATE TABLE "analytics_provider_settings" (
	"provider" "analytics_provider" PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"tracking_id" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_provider_settings" ADD CONSTRAINT "analytics_provider_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;