ALTER TABLE "ai_tool_policies" DROP CONSTRAINT "ai_tool_policies_bounds";--> statement-breakpoint
ALTER TABLE "ai_tool_policies" ALTER COLUMN "max_calls_per_turn" SET DEFAULT 100;--> statement-breakpoint
ALTER TABLE "ai_tool_workflows" ALTER COLUMN "max_calls" SET DEFAULT 100;--> statement-breakpoint
ALTER TABLE "ai_tool_policies" ADD CONSTRAINT "ai_tool_policies_bounds" CHECK ("ai_tool_policies"."max_calls_per_turn" >= 1 and "ai_tool_policies"."max_calls_per_turn" <= 100 and "ai_tool_policies"."timeout_ms" >= 1000 and "ai_tool_policies"."timeout_ms" <= 120000);