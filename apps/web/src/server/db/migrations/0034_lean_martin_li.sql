ALTER TABLE "ai_settings" ADD COLUMN "tool_max_calls" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "tool_planner_temperature" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "tool_planner_max_output_tokens" integer;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "tool_planner_timeout_ms" integer DEFAULT 120000 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "assistant_system_prompt" text;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "tool_system_prompt" text;