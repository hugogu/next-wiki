CREATE TABLE "site_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"site_name" text DEFAULT 'next-wiki' NOT NULL,
	"footer_copyright" text,
	"icp_number" text,
	"icp_url" text,
	"public_security_number" text,
	"public_security_url" text,
	"icon_data" "bytea",
	"icon_mime" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;