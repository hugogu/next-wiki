ALTER TABLE "outbound_request_logs" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "outbound_request_logs" ADD COLUMN "input_tokens" integer;--> statement-breakpoint
ALTER TABLE "outbound_request_logs" ADD COLUMN "output_tokens" integer;--> statement-breakpoint
ALTER TABLE "outbound_request_logs" ADD COLUMN "cached_input_tokens" integer;