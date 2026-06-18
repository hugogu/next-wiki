ALTER TABLE "api_audit_entries" DROP CONSTRAINT "api_audit_entries_key_id_api_keys_id_fk";
--> statement-breakpoint
ALTER TABLE "api_audit_entries" DROP CONSTRAINT "api_audit_entries_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "api_audit_entries" ADD CONSTRAINT "api_audit_entries_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_audit_entries" ADD CONSTRAINT "api_audit_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;