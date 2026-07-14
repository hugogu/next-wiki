CREATE TABLE "feishu_app_registration_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid NOT NULL,
	"domain" text NOT NULL,
	"device_code_encrypted" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_polled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feishu_app_registration_sessions" ADD CONSTRAINT "feishu_app_registration_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feishu_app_registration_sessions_creator_expires_idx" ON "feishu_app_registration_sessions" USING btree ("created_by","expires_at");--> statement-breakpoint
CREATE INDEX "feishu_app_registration_sessions_expires_idx" ON "feishu_app_registration_sessions" USING btree ("expires_at");