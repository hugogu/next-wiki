ALTER TABLE "api_keys" ADD COLUMN "space_access" "space_kind"[] DEFAULT '{"wiki"}' NOT NULL;--> statement-breakpoint
-- 046: preserve existing behavior for keys owned by admins (who could already
-- read raw/generated via public visibility); every other key is tightened to
-- the new default of wiki-only, matching the new admin-gated model.
UPDATE "api_keys" SET "space_access" = '{wiki,raw,generated}'
FROM "users"
WHERE "api_keys"."user_id" = "users"."id" AND "users"."role" = 'admin';