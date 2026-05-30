-- =============================================================================
-- 0001_mvp_init.sql
-- Initial schema for next-wiki MVP
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector"; -- optional; used for AI embeddings

-- =============================================================================
-- AUTH TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    email           TEXT UNIQUE,                         -- nullable: external accounts may have none
    name            TEXT NOT NULL,
    email_verified  BOOLEAN NOT NULL DEFAULT false,
    image           TEXT,
    avatar_url      TEXT,
    status          TEXT NOT NULL DEFAULT 'active',      -- invited | active | suspended
    preferred_locale TEXT NOT NULL DEFAULT 'en',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_identities (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_type    TEXT NOT NULL,                      -- local | oidc | ldap | saml
    provider_key     TEXT NOT NULL,
    external_subject TEXT NOT NULL,
    metadata         JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider_type, provider_key, external_subject)
);

CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,
    token        TEXT NOT NULL UNIQUE,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address   TEXT,
    user_agent   TEXT
);

CREATE TABLE IF NOT EXISTS auth_providers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_type TEXT NOT NULL,                         -- oidc | ldap | saml
    key           TEXT NOT NULL UNIQUE,
    label         TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'disabled',      -- disabled | enabled | error
    config        JSONB NOT NULL DEFAULT '{}',
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
    id                        TEXT PRIMARY KEY,
    user_id                   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id                TEXT NOT NULL,
    provider_id               TEXT NOT NULL,
    access_token              TEXT,
    refresh_token             TEXT,
    id_token                  TEXT,
    access_token_expires_at   TIMESTAMPTZ,
    refresh_token_expires_at  TIMESTAMPTZ,
    scope                     TEXT,
    password                  TEXT,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts (user_id);
CREATE INDEX IF NOT EXISTS accounts_provider_idx ON accounts (provider_id, account_id);

CREATE TABLE IF NOT EXISTS groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT,
    is_system   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_memberships (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    role      TEXT NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS api_tokens (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label               TEXT NOT NULL,
    token_hash          TEXT NOT NULL UNIQUE,
    scope_set           TEXT[] NOT NULL DEFAULT '{}',
    status              TEXT NOT NULL DEFAULT 'active',  -- active | revoked
    created_by_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS site_settings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key                 TEXT NOT NULL UNIQUE,
    value               TEXT NOT NULL,
    value_type          TEXT NOT NULL DEFAULT 'string',  -- string | boolean | integer | json | secret
    updated_by_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- WIKI TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS spaces (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key                   TEXT NOT NULL UNIQUE,
    name                  TEXT NOT NULL,
    description           TEXT,
    default_locale        TEXT NOT NULL DEFAULT 'en',
    is_public_by_default  BOOLEAN NOT NULL DEFAULT false,
    navigation_mode       TEXT NOT NULL DEFAULT 'tree',  -- tree | flat
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS translation_groups (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pages (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id             UUID NOT NULL REFERENCES spaces(id),
    translation_group_id UUID REFERENCES translation_groups(id),
    path                 TEXT NOT NULL,
    locale               TEXT NOT NULL DEFAULT 'en',
    title                TEXT NOT NULL,
    summary              TEXT,
    status               TEXT NOT NULL DEFAULT 'draft',  -- draft | published | archived | deleted
    current_revision_id  UUID,                           -- set after first revision; FK added below
    search_vector        TSVECTOR,
    created_by_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
    deleted_at           TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (space_id, path, locale)
);

CREATE TABLE IF NOT EXISTS page_revisions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id             UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    revision_number     INTEGER NOT NULL,
    title               TEXT NOT NULL,
    source_format       TEXT NOT NULL DEFAULT 'markdown',
    source_content      TEXT NOT NULL,
    content_hash        TEXT NOT NULL,
    change_summary      TEXT,
    authored_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (page_id, revision_number)
);

-- Deferred FK: pages.current_revision_id -> page_revisions(id)
ALTER TABLE pages
    ADD CONSTRAINT fk_pages_current_revision
    FOREIGN KEY (current_revision_id)
    REFERENCES page_revisions(id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS page_links (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_page_id    UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    source_revision_id UUID NOT NULL REFERENCES page_revisions(id) ON DELETE CASCADE,
    target_space_key  TEXT NOT NULL,
    target_path       TEXT NOT NULL,
    target_locale     TEXT,
    link_text         TEXT,
    status            TEXT NOT NULL DEFAULT 'unknown',   -- valid | broken | redirected | unknown
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS page_redirects (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id   UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    from_path  TEXT NOT NULL,
    to_path    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (space_id, from_path)
);

CREATE TABLE IF NOT EXISTS tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE,
    label       TEXT NOT NULL,
    description TEXT,
    color_token TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS page_tags (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id             UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    tag_id              UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    assigned_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    assigned_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (page_id, tag_id)
);

CREATE TABLE IF NOT EXISTS assets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    storage_kind        TEXT NOT NULL DEFAULT 'local',   -- local | object
    path                TEXT NOT NULL,
    original_filename   TEXT NOT NULL,
    mime_type           TEXT NOT NULL,
    byte_size           BIGINT NOT NULL,
    checksum            TEXT NOT NULL,
    kind                TEXT NOT NULL DEFAULT 'other',   -- image | document | diagram-source | theme-asset | other
    uploaded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asset_references (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id       UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    owner_type     TEXT NOT NULL,                        -- page | theme
    owner_id       UUID NOT NULL,
    reference_role TEXT NOT NULL,                        -- inline | attachment | diagram-source | logo | favicon
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permission_rules (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type  TEXT NOT NULL,                         -- user | group
    subject_id    UUID NOT NULL,
    resource_type TEXT NOT NULL,                         -- site | space | page | asset | ai | integration
    resource_id   UUID,                                  -- null = applies to all of that type
    action        TEXT NOT NULL,                         -- read | write | delete | manage | execute
    effect        TEXT NOT NULL,                         -- allow | deny
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS themes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key               TEXT NOT NULL UNIQUE,
    name              TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'draft',     -- draft | active | archived
    origin            TEXT NOT NULL DEFAULT 'custom',    -- system | custom
    token_set         JSONB NOT NULL DEFAULT '{}',
    chrome_config     JSONB NOT NULL DEFAULT '{}',
    created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- AI TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_providers (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key                   TEXT NOT NULL UNIQUE,
    label                 TEXT NOT NULL,
    provider_type         TEXT NOT NULL,                 -- openai | anthropic | ollama | custom
    status                TEXT NOT NULL DEFAULT 'disabled', -- disabled | enabled | error
    capabilities          TEXT[] NOT NULL DEFAULT '{}',
    endpoint              TEXT,
    encrypted_credentials TEXT,                          -- AES-GCM encrypted JSON blob
    default_model         TEXT,
    embedding_model       TEXT,
    error_message         TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_knowledge_records (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_revision_id UUID NOT NULL REFERENCES page_revisions(id) ON DELETE CASCADE,
    provider_id      UUID NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
    index_version    INTEGER NOT NULL DEFAULT 1,
    summary          TEXT,
    embedding_ref    TEXT,
    entities         JSONB,
    citation_anchors JSONB,
    ingestion_status TEXT NOT NULL DEFAULT 'pending',    -- pending | ready | failed
    error_message    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_conversations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id  UUID REFERENCES ai_providers(id) ON DELETE SET NULL,
    context_type TEXT NOT NULL DEFAULT 'global',         -- global | space | page
    context_id   UUID,
    title        TEXT,
    status       TEXT NOT NULL DEFAULT 'active',         -- active | archived | deleted
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_conversation_messages (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id        UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role                   TEXT NOT NULL,                -- user | assistant | system
    body                   TEXT NOT NULL,
    status                 TEXT NOT NULL DEFAULT 'completed', -- pending | completed | failed
    generated_draft_page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_citations (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id       UUID NOT NULL REFERENCES ai_conversation_messages(id) ON DELETE CASCADE,
    page_revision_id UUID NOT NULL REFERENCES page_revisions(id) ON DELETE CASCADE,
    excerpt_locator  TEXT,
    order_index      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS background_tasks (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_type             TEXT NOT NULL,
    requested_by_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
    resource_type         TEXT,
    resource_id           UUID,
    status                TEXT NOT NULL DEFAULT 'queued', -- queued | running | completed | failed | cancelled
    progress_label        TEXT,
    error_summary         TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at            TIMESTAMPTZ,
    finished_at           TIMESTAMPTZ
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Full-text search (GIN required for tsvector queries)
CREATE INDEX IF NOT EXISTS idx_pages_search_vector ON pages USING GIN (search_vector);

-- Common lookup patterns
CREATE INDEX IF NOT EXISTS idx_pages_space_status    ON pages (space_id, status);
CREATE INDEX IF NOT EXISTS idx_pages_status          ON pages (status);
CREATE INDEX IF NOT EXISTS idx_pages_deleted_at      ON pages (deleted_at) WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_page_revisions_page   ON page_revisions (page_id);

CREATE INDEX IF NOT EXISTS idx_page_links_source     ON page_links (source_page_id);
CREATE INDEX IF NOT EXISTS idx_page_links_target     ON page_links (target_space_key, target_path);
CREATE INDEX IF NOT EXISTS idx_page_links_status     ON page_links (status) WHERE status = 'broken';

CREATE INDEX IF NOT EXISTS idx_sessions_user         ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires      ON sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_user_identities_user  ON user_identities (user_id);

CREATE INDEX IF NOT EXISTS idx_group_memberships_user  ON group_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_group_memberships_group ON group_memberships (group_id);

CREATE INDEX IF NOT EXISTS idx_permission_rules_subject  ON permission_rules (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_permission_rules_resource ON permission_rules (resource_type, resource_id);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user     ON ai_conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conv_messages_conv     ON ai_conversation_messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_revision     ON ai_knowledge_records (page_revision_id);
CREATE INDEX IF NOT EXISTS idx_background_tasks_status   ON background_tasks (status) WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS idx_asset_references_owner    ON asset_references (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_page_tags_tag             ON page_tags (tag_id);

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- System groups (is_system = true means they cannot be deleted via UI)
INSERT INTO groups (key, name, description, is_system)
VALUES
    ('everyone',       'Everyone',       'Automatic group that contains all users', true),
    ('administrators', 'Administrators', 'Full site administration access',         true)
ON CONFLICT (key) DO NOTHING;

-- Default system theme
INSERT INTO themes (key, name, status, origin)
VALUES
    ('default', 'Default', 'active', 'system')
ON CONFLICT (key) DO NOTHING;
