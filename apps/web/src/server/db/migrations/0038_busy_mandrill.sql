CREATE TYPE "public"."skill_file_kind" AS ENUM('instruction', 'reference', 'script');--> statement-breakpoint
CREATE TYPE "public"."skill_file_operation" AS ENUM('create', 'update', 'delete', 'rename');--> statement-breakpoint
CREATE TYPE "public"."skill_source" AS ENUM('builtin', 'directory', 'managed');--> statement-breakpoint
CREATE TYPE "public"."skill_validation_state" AS ENUM('valid', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."tool_call_strategy" AS ENUM('auto', 'native', 'text');--> statement-breakpoint
CREATE TABLE "skill_file_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"path" text NOT NULL,
	"revision" integer NOT NULL,
	"content" text NOT NULL,
	"operation" "skill_file_operation" NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"path" text NOT NULL,
	"kind" "skill_file_kind" NOT NULL,
	"content" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_files_revision_positive" CHECK ("skill_files"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "skill_settings" (
	"name" text PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"last_used_at" timestamp with time zone,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source" "skill_source" NOT NULL,
	"description" text NOT NULL,
	"validation_state" "skill_validation_state" DEFAULT 'valid' NOT NULL,
	"validation_error" text,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_name_format" CHECK ("skills"."name" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "skills_source_stored" CHECK ("skills"."source" <> 'directory')
);
--> statement-breakpoint
ALTER TABLE "ai_models" ADD COLUMN "tool_call_strategy" "tool_call_strategy" DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_models" ADD COLUMN "native_tool_call_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "skill_file_revisions" ADD CONSTRAINT "skill_file_revisions_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_file_revisions" ADD CONSTRAINT "skill_file_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_files" ADD CONSTRAINT "skill_files_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_files" ADD CONSTRAINT "skill_files_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_settings" ADD CONSTRAINT "skill_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_file_revisions_unique" ON "skill_file_revisions" USING btree ("skill_id","path","revision");--> statement-breakpoint
CREATE INDEX "skill_file_revisions_skill_created_idx" ON "skill_file_revisions" USING btree ("skill_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_files_skill_path_unique" ON "skill_files" USING btree ("skill_id","path");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_name_unique" ON "skills" USING btree ("name") WHERE "skills"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "skills_source_idx" ON "skills" USING btree ("source");