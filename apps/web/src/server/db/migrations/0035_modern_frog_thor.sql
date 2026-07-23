ALTER TABLE "ai_settings" ALTER COLUMN "tool_planner_max_output_tokens" SET DEFAULT 32768;--> statement-breakpoint
UPDATE "ai_settings" SET "tool_planner_max_output_tokens" = 32768 WHERE "tool_planner_max_output_tokens" IS NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ALTER COLUMN "tool_planner_max_output_tokens" SET NOT NULL;