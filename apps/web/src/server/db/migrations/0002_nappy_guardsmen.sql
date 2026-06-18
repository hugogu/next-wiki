CREATE TYPE "public"."api_key_scope" AS ENUM('view', 'create', 'edit', 'delete', 'share', 'run');--> statement-breakpoint
CREATE TABLE "api_audit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_id" uuid,
	"user_id" uuid,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status_code" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"auth_status" text NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scopes" "api_key_scope"[] NOT NULL,
	"key_prefix" text NOT NULL,
	"key_secret_encrypted" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "api_keys_key_prefix_unique" UNIQUE("key_prefix")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme_preference" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale_preference" text;--> statement-breakpoint
ALTER TABLE "api_audit_entries" ADD CONSTRAINT "api_audit_entries_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_audit_entries" ADD CONSTRAINT "api_audit_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_audit_entries_user_id_created_at_index" ON "api_audit_entries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "api_audit_entries_created_at_index" ON "api_audit_entries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "api_audit_entries_key_id_created_at_index" ON "api_audit_entries" USING btree ("key_id","created_at");--> statement-breakpoint
CREATE INDEX "api_audit_entries_status_code_index" ON "api_audit_entries" USING btree ("status_code");--> statement-breakpoint
CREATE INDEX "api_keys_user_id_revoked_at_index" ON "api_keys" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX "api_keys_user_id_index" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_email_index" ON "users" USING btree ("email");