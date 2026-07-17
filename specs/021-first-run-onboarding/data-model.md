# Data Model: First-Run Onboarding

**Feature**: 021-first-run-onboarding
**Date**: 2026-07-17
**Database**: PostgreSQL 16 via Drizzle migrations

## Storage Approach

Most entities already exist and must be reused:

- `users`: initial Admin account.
- `sessions`: signed-in session after account creation.
- `ai_settings`: global AI enabled state and OpenRouter detector credential.
- `ai_providers`: OpenRouter provider records created or reused by bootstrap.
- `ai_models` and `ai_model_capabilities`: detected model catalog and evidence.
- `ai_purpose_assignments`: active models for `wiki_text`, `wiki_embedding`,
  and `wiki_image`.
- `ai_user_entitlements`: explicit per-user AI switches when onboarding needs
  to record Admin access.
- `ai_actions`: provider test/model sync/background status records.
- `spaces`, `pages`, `page_revisions`: optional sample/help pages.

Add one singleton progress table. All DDL must be generated through Drizzle
after editing schema files; do not hand-author migration SQL.

## New Entity: Setup Progress

Represents the deployment's one-time first-run onboarding progress.

Suggested table: `setup_progress`

| Field | Type | Rules |
|---|---|---|
| `id` | text | Primary key. Singleton value `default`. |
| `admin_user_id` | uuid nullable | References `users.id`; set after first Admin creation. |
| `account_status` | text/enum | `needed`, `created`. |
| `ai_status` | text/enum | `not_started`, `skipped`, `queued`, `running`, `completed`, `partial`, `failed`, `disabled`. |
| `sample_pages_status` | text/enum | `not_started`, `skipped`, `completed`, `partial`, `failed`. |
| `current_step` | text/enum | `account`, `ai`, `sample_pages`, `summary`, `closed`. |
| `ai_action_id` | uuid nullable | References `ai_actions.id` for the latest bootstrap/model-sync action when applicable. |
| `ai_result` | jsonb | Per-purpose outcome summary for chat/text, embedding, and image generation. No secrets. |
| `sample_pages_result` | jsonb | Per-page outcome summary for generated/skipped/collision/failed pages. |
| `completed_at` | timestamp nullable | Set when onboarding reaches summary/closed. |
| `created_at` | timestamp | Defaults to now. |
| `updated_at` | timestamp | Updated on every step transition. |

Validation:

- Only one row may exist.
- `admin_user_id` must be set before `current_step` advances beyond `account`.
- `ai_result` must never contain OpenRouter credentials, raw provider payloads,
  or prompts/page content.
- `sample_pages_result` stores page ids/paths/statuses only; page bodies remain
  in `page_revisions`.
- `completed_at` is set only after account creation and an explicit AI choice
  plus sample-page choice.

## Existing Entity: Initial Admin Account

Backed by `users`.

Relevant fields:

- `email`: validated unique email.
- `password_hash`: bcrypt hash, never returned.
- `role`: `admin`.
- `status`: `active`.
- `deleted_at`: null for active Admin.

Validation:

- First-run account creation is allowed only when no active Admin exists.
- Concurrent submissions must create at most one Admin.
- A successful first-run account sets `setup_progress.admin_user_id`.

## Existing Entity: OpenRouter Bootstrap Configuration

Backed by `ai_settings`, `ai_providers`, and encrypted credentials.

Relevant data:

- `ai_settings.enabled`: enabled when AI bootstrap succeeds or when Admin
  explicitly enables it during setup.
- `ai_settings.model_detector_api_key_encrypted`: protected OpenRouter detector
  key.
- `ai_providers`: one provider per supported capability where existing AI admin
  behavior requires distinct provider records.
- `ai_models` / `ai_model_capabilities`: detected capability evidence.

Validation:

- Credentials are write-only and encrypted at rest.
- Bootstrap cannot perform detector/provider calls when AI mode is globally
  disabled.
- Existing provider records are reused or left untouched rather than overwritten
  silently.

## Existing Entity: AI Purpose Setup Result

Backed by `ai_purpose_assignments` plus `setup_progress.ai_result`.

Purpose keys:

- `wiki_text`: chat/wiki question-answering text generation.
- `wiki_embedding`: semantic indexing and retrieval.
- `wiki_image`: image generation.

Outcome values:

- `configured`: compatible model assigned.
- `skipped`: Admin skipped AI setup.
- `unavailable`: no compatible detected model.
- `needs_manual_setup`: detection was partial or ambiguous.
- `failed`: bootstrap action failed.

Validation:

- A purpose may be marked `configured` only when assignment validation accepts
  the model.
- Unknown detector evidence cannot satisfy a purpose unless Admin explicitly
  chooses an override through normal AI administration.
- Per-user Admin AI access must not grant page permissions beyond the Admin
  role.

## Existing Entity: Sample Page Set

Backed by `pages` and `page_revisions`.

Canonical pages:

| Path | Title | Behavior |
|---|---|---|
| `welcome` | `Welcome to next-wiki` | Enrich existing welcome page or create if absent. |
| `help/markdown-syntax` | `Markdown Syntax Guide` | Demonstrates supported Markdown features. |
| `help/main-features` | `Main Features Guide` | Introduces core product capabilities. |

Validation:

- Pages are authored by the initial Admin when available.
- Pages are published revisions and participate in normal history.
- Generation is idempotent by `(space_id, path, locale)`.
- A user-authored path collision is skipped or requires explicit Admin
  confirmation; never overwrite silently.
- Creating or updating sample pages invalidates public page and navigation
  caches.

## State Transitions

```text
uninitialized
  -> account created
  -> ai skipped
  -> sample pages skipped
  -> complete

uninitialized
  -> account created
  -> ai queued/running
  -> ai completed | ai partial | ai failed | ai skipped
  -> sample pages completed | sample pages partial | sample pages failed | sample pages skipped
  -> complete
```

Rules:

- Once any active Admin exists, public first-admin creation is closed.
- Failed AI or sample-page steps remain retryable by the signed-in initial
  Admin until setup is marked complete.
- Completing onboarding does not hide normal Admin AI/page settings; it only
  closes the first-run guided surface.
