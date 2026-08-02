CREATE TYPE "public"."integration_auth_mode" AS ENUM('https_token', 'ssh');--> statement-breakpoint
CREATE TYPE "public"."integration_kind" AS ENUM('github');--> statement-breakpoint
CREATE TYPE "public"."static_site_provider" AS ENUM('github_pages');--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "integration_kind" NOT NULL,
	"label" text,
	"auth_mode" "integration_auth_mode" NOT NULL,
	"username" text,
	"secret_encrypted" text,
	"public_key" text,
	"fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "static_site_targets" ALTER COLUMN "auth_mode" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "static_site_targets" ADD COLUMN "provider" "static_site_provider" DEFAULT 'github_pages' NOT NULL;--> statement-breakpoint
ALTER TABLE "static_site_targets" ADD COLUMN "integration_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_kind" ON "integrations" USING btree ("kind");--> statement-breakpoint
ALTER TABLE "static_site_targets" ADD CONSTRAINT "static_site_targets_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Data migration: lift existing GitHub credentials into the shared integration.
--
-- Git export and static site publishing both authenticate against the same
-- GitHub account, so the credential belongs to neither of them. Git export's is
-- preferred as the source because it is the older, more likely production
-- configuration; a static-site-only deployment falls back to its own.
--
-- Idempotent by construction: the unique index on `kind` means a second run
-- inserts nothing, and the updates are conditional on integration_id being null.
DO $$
DECLARE
  git_config jsonb;
  git_secret text;
  site_row record;
  new_id uuid;
BEGIN
  SELECT config, secret_encrypted INTO git_config, git_secret
  FROM storage_backends
  WHERE purpose = 'git_export'
  LIMIT 1;

  SELECT * INTO site_row FROM static_site_targets LIMIT 1;

  IF git_secret IS NOT NULL AND (git_config ->> 'authMode') IS NOT NULL THEN
    INSERT INTO integrations (kind, label, auth_mode, username, secret_encrypted, public_key, fingerprint)
    VALUES (
      'github',
      'GitHub',
      (git_config ->> 'authMode')::integration_auth_mode,
      git_config ->> 'username',
      git_secret,
      git_config ->> 'publicKey',
      git_config ->> 'fingerprint'
    )
    ON CONFLICT (kind) DO NOTHING
    RETURNING id INTO new_id;
  ELSIF site_row.secret_encrypted IS NOT NULL THEN
    INSERT INTO integrations (kind, label, auth_mode, username, secret_encrypted, public_key, fingerprint)
    VALUES (
      'github',
      'GitHub',
      site_row.auth_mode::text::integration_auth_mode,
      site_row.username,
      site_row.secret_encrypted,
      site_row.public_key,
      site_row.fingerprint
    )
    ON CONFLICT (kind) DO NOTHING
    RETURNING id INTO new_id;
  END IF;

  IF new_id IS NULL THEN
    SELECT id INTO new_id FROM integrations WHERE kind = 'github' LIMIT 1;
  END IF;

  IF new_id IS NOT NULL THEN
    UPDATE static_site_targets SET integration_id = new_id WHERE integration_id IS NULL;
  END IF;
END $$;
