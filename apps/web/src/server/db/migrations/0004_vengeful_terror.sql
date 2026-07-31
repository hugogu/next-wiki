CREATE TYPE "public"."static_site_auth_mode" AS ENUM('https_token', 'ssh');--> statement-breakpoint
CREATE TYPE "public"."static_site_publication_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."static_site_publication_trigger" AS ENUM('manual', 'content_change', 'scheduled', 'takedown');--> statement-breakpoint
CREATE TABLE "static_site_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"status" "static_site_publication_status" DEFAULT 'queued' NOT NULL,
	"trigger" "static_site_publication_trigger" NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"pages_published" integer DEFAULT 0 NOT NULL,
	"assets_published" integer DEFAULT 0 NOT NULL,
	"pages_excluded" integer DEFAULT 0 NOT NULL,
	"exclusion_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"bytes_total" bigint DEFAULT 0 NOT NULL,
	"commit_sha" text,
	"forced_push" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "static_site_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"remote_url" text NOT NULL,
	"branch" text NOT NULL,
	"base_url" text NOT NULL,
	"auth_mode" "static_site_auth_mode" NOT NULL,
	"username" text,
	"secret_encrypted" text,
	"public_key" text,
	"fingerprint" text,
	"auto_publish_on_change" boolean DEFAULT false NOT NULL,
	"scheduled_publish_enabled" boolean DEFAULT false NOT NULL,
	"scheduled_interval_minutes" integer DEFAULT 60 NOT NULL,
	"is_stale" boolean DEFAULT false NOT NULL,
	"last_publication_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "static_site_publications" ADD CONSTRAINT "static_site_publications_target_id_static_site_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."static_site_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "static_site_publications_target_created" ON "static_site_publications" USING btree ("target_id","created_at" DESC NULLS LAST);