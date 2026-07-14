CREATE TYPE "public"."audit_origin" AS ENUM('web', 'api', 'feishu');--> statement-breakpoint
CREATE TYPE "public"."feishu_binding_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."feishu_connection_mode" AS ENUM('webhook');--> statement-breakpoint
CREATE TYPE "public"."feishu_delivery_status" AS ENUM('queued', 'running', 'delivered', 'retry', 'failed', 'blocked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."feishu_inbox_status" AS ENUM('accepted', 'processed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."feishu_notification_event_type" AS ENUM('page_published', 'ai_action_completed', 'transfer_completed');--> statement-breakpoint
CREATE TYPE "public"."feishu_session_state" AS ENUM('active', 'expired', 'reset');--> statement-breakpoint
CREATE TYPE "public"."feishu_subscription_mode" AS ENUM('direct', 'public_safe_group', 'private_recipients_group');--> statement-breakpoint
CREATE TYPE "public"."feishu_subscription_status" AS ENUM('active', 'paused', 'failing', 'action_required');--> statement-breakpoint
CREATE TABLE "feishu_binding_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"open_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feishu_binding_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "feishu_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"open_id" text NOT NULL,
	"union_id" text,
	"display_name" text,
	"status" "feishu_binding_status" DEFAULT 'active' NOT NULL,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text
);
--> statement-breakpoint
CREATE TABLE "feishu_bot_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"binding_id" uuid NOT NULL,
	"chat_id" text NOT NULL,
	"ai_action_id" uuid,
	"state" "feishu_session_state" DEFAULT 'active' NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feishu_inbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_key" text NOT NULL,
	"event_type" text NOT NULL,
	"source_event_id" text NOT NULL,
	"open_id" text,
	"chat_id" text,
	"status" "feishu_inbox_status" DEFAULT 'accepted' NOT NULL,
	"correlation_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feishu_integration_config" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text,
	"app_secret_encrypted" text,
	"encrypt_key_encrypted" text,
	"verification_token_encrypted" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"connection_mode" "feishu_connection_mode" DEFAULT 'webhook' NOT NULL,
	"user_rate_limit_per_minute" integer DEFAULT 10 NOT NULL,
	"chat_rate_limit_per_minute" integer DEFAULT 30 NOT NULL,
	"notification_retention_hours" integer DEFAULT 72 NOT NULL,
	"last_connected_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feishu_notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_action_id" uuid,
	"event_id" uuid,
	"subscription_id" uuid,
	"recipient_binding_id" uuid,
	"target_open_id" text,
	"target_chat_id" text,
	"status" "feishu_delivery_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_by" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "feishu_notification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "feishu_notification_event_type" NOT NULL,
	"page_id" uuid,
	"space_id" uuid,
	"ai_action_id" uuid,
	"transfer_id" uuid,
	"safe_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feishu_notification_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" "feishu_notification_event_type" NOT NULL,
	"mode" "feishu_subscription_mode" NOT NULL,
	"target_open_id" text,
	"target_chat_id" text,
	"space_id" uuid,
	"status" "feishu_subscription_status" DEFAULT 'active' NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_audit_entries" ADD COLUMN "origin" "audit_origin" DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_audit_entries" ADD COLUMN "external_correlation_id" text;--> statement-breakpoint
ALTER TABLE "feishu_bindings" ADD CONSTRAINT "feishu_bindings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_bot_sessions" ADD CONSTRAINT "feishu_bot_sessions_binding_id_feishu_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."feishu_bindings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_bot_sessions" ADD CONSTRAINT "feishu_bot_sessions_ai_action_id_ai_actions_id_fk" FOREIGN KEY ("ai_action_id") REFERENCES "public"."ai_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_deliveries" ADD CONSTRAINT "feishu_notification_deliveries_ai_action_id_ai_actions_id_fk" FOREIGN KEY ("ai_action_id") REFERENCES "public"."ai_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_deliveries" ADD CONSTRAINT "feishu_notification_deliveries_event_id_feishu_notification_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."feishu_notification_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_deliveries" ADD CONSTRAINT "feishu_notification_deliveries_subscription_id_feishu_notification_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."feishu_notification_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_deliveries" ADD CONSTRAINT "feishu_notification_deliveries_recipient_binding_id_feishu_bindings_id_fk" FOREIGN KEY ("recipient_binding_id") REFERENCES "public"."feishu_bindings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_events" ADD CONSTRAINT "feishu_notification_events_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_events" ADD CONSTRAINT "feishu_notification_events_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_events" ADD CONSTRAINT "feishu_notification_events_ai_action_id_ai_actions_id_fk" FOREIGN KEY ("ai_action_id") REFERENCES "public"."ai_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_events" ADD CONSTRAINT "feishu_notification_events_transfer_id_transfer_runs_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."transfer_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_subscriptions" ADD CONSTRAINT "feishu_notification_subscriptions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feishu_notification_subscriptions" ADD CONSTRAINT "feishu_notification_subscriptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feishu_binding_tokens_open_id_idx" ON "feishu_binding_tokens" USING btree ("open_id");--> statement-breakpoint
CREATE INDEX "feishu_binding_tokens_expires_idx" ON "feishu_binding_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_bindings_active_open_id" ON "feishu_bindings" USING btree ("open_id") WHERE "feishu_bindings"."status" = 'active';--> statement-breakpoint
CREATE INDEX "feishu_bindings_user_idx" ON "feishu_bindings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feishu_bindings_open_id_idx" ON "feishu_bindings" USING btree ("open_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_bot_sessions_active" ON "feishu_bot_sessions" USING btree ("binding_id","chat_id") WHERE "feishu_bot_sessions"."state" = 'active';--> statement-breakpoint
CREATE INDEX "feishu_bot_sessions_expires_idx" ON "feishu_bot_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_inbox_events_dedupe" ON "feishu_inbox_events" USING btree ("tenant_key","event_type","source_event_id");--> statement-breakpoint
CREATE INDEX "feishu_inbox_events_open_rate_idx" ON "feishu_inbox_events" USING btree ("open_id","received_at");--> statement-breakpoint
CREATE INDEX "feishu_inbox_events_chat_rate_idx" ON "feishu_inbox_events" USING btree ("chat_id","received_at");--> statement-breakpoint
CREATE INDEX "feishu_inbox_events_expires_idx" ON "feishu_inbox_events" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_deliveries_answer_unique" ON "feishu_notification_deliveries" USING btree ("ai_action_id") WHERE "feishu_notification_deliveries"."ai_action_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_deliveries_notif_recipient_unique" ON "feishu_notification_deliveries" USING btree ("event_id","subscription_id","recipient_binding_id") WHERE "feishu_notification_deliveries"."event_id" is not null and "feishu_notification_deliveries"."recipient_binding_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_deliveries_notif_group_unique" ON "feishu_notification_deliveries" USING btree ("event_id","subscription_id") WHERE "feishu_notification_deliveries"."event_id" is not null and "feishu_notification_deliveries"."recipient_binding_id" is null;--> statement-breakpoint
CREATE INDEX "feishu_deliveries_due_idx" ON "feishu_notification_deliveries" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "feishu_deliveries_subscription_idx" ON "feishu_notification_deliveries" USING btree ("subscription_id","status");--> statement-breakpoint
CREATE INDEX "feishu_notification_events_type_idx" ON "feishu_notification_events" USING btree ("type","occurred_at");--> statement-breakpoint
CREATE INDEX "feishu_notification_events_expires_idx" ON "feishu_notification_events" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "feishu_subscriptions_event_type_idx" ON "feishu_notification_subscriptions" USING btree ("event_type","status");--> statement-breakpoint
CREATE INDEX "feishu_subscriptions_status_idx" ON "feishu_notification_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "api_audit_entries_origin_created_at_index" ON "api_audit_entries" USING btree ("origin","created_at");--> statement-breakpoint
CREATE INDEX "api_audit_entries_external_correlation_id_index" ON "api_audit_entries" USING btree ("external_correlation_id");