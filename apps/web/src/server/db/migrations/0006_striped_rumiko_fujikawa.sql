CREATE TABLE "search_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"semantic_search_enabled" boolean DEFAULT true NOT NULL,
	"min_relevance_score" integer DEFAULT 0 NOT NULL,
	"show_excerpts" boolean DEFAULT true NOT NULL,
	"excerpt_length" integer DEFAULT 120 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_settings_singleton_id" CHECK ("search_settings"."id" = 'default'),
	CONSTRAINT "search_settings_min_relevance_score_range" CHECK ("search_settings"."min_relevance_score" >= -100 and "search_settings"."min_relevance_score" <= 100),
	CONSTRAINT "search_settings_excerpt_length_range" CHECK ("search_settings"."excerpt_length" >= 20 and "search_settings"."excerpt_length" <= 500)
);
