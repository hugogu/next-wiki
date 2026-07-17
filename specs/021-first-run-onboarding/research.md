# Research: First-Run Onboarding

**Feature**: 021-first-run-onboarding
**Date**: 2026-07-17

## Decision: Extend the existing `/setup` entry point

**Rationale**: The project already has `/setup`, `/api/auth/setup`,
`setupInputSchema`, `SetupForm`, and `setupService.setupAdmin()` for first-admin
creation. Extending that flow preserves one canonical setup entry point and
keeps browser-native routing simple.

**Alternatives considered**:

- Add a new `/onboarding` route: rejected because it would create a duplicate
  first-run entry point and weaken the URL contract.
- Move setup into `/admin`: rejected because no Admin session exists before the
  first account is created.

## Decision: Persist post-account setup progress in one singleton table

**Rationale**: The spec requires refresh/retry recovery and accurate final
summaries. Existing tables can show that an Admin exists, AI settings exist, or
pages exist, but they cannot reliably record that the Admin deliberately skipped
AI or declined examples. A singleton setup-progress table keeps those choices
explicit without adding any service dependency.

**Alternatives considered**:

- Use only derived state from users, AI settings, and pages: rejected because it
  cannot distinguish not-started from skipped/declined.
- Store progress only in browser state: rejected because refreshes, new
  browsers, and interrupted setup would lose progress.
- Store progress in `site_settings.config`: rejected because `site_settings`
  currently models public site identity/footer settings, not one-time setup
  workflow state.

## Decision: Keep first-admin creation as an atomic server operation

**Rationale**: Concurrent first-run browsers must produce exactly one Admin.
The setup service remains the single account-creation boundary, validates the
email/password, creates the Admin, establishes a session, and marks account
setup complete. Implementation must use a transaction or DB-level conflict
guard so duplicate submissions cannot create multiple elevated users.

**Alternatives considered**:

- Client-side disabling after submit: rejected because it does not protect
  parallel browsers or retry races.
- Reusing normal registration directly: rejected because onboarding needs
  post-account setup state and summary, while normal registration stays a user
  flow after initialization.

## Decision: OpenRouter bootstrap reuses canonical AI admin services

**Rationale**: Existing AI support already owns encrypted settings, OpenRouter
provider registration, model sync, assignments, entitlements, and secret
redaction. Onboarding should call that service layer and record per-purpose
setup results instead of writing AI rows directly.

**Alternatives considered**:

- Duplicate provider/model assignment logic inside setup: rejected because it
  would drift from Admin AI behavior and capability validation.
- Only store the OpenRouter key and leave every assignment manual: rejected
  because the requested quick-start flow should enable chat, embeddings, and
  image generation when compatible models are detected.

## Decision: Long OpenRouter detection returns resumable setup status

**Rationale**: Provider detection and model sync may exceed the request budget.
The project constitution requires heavy operations to be background jobs via
pg-boss. Onboarding should create or reuse existing AI action lifecycle records
and show progress/results through setup state.

**Alternatives considered**:

- Run all model detection inline during form submission: rejected because it can
  exceed 500 ms, time out, or fail partially.
- Skip model detection and blindly assign model names: rejected because model
  names are not capability proof and assignments must be evidence-based.

## Decision: Sample/help pages are normal published wiki pages

**Rationale**: The sample pages must demonstrate the real product and remain
editable/versioned. They should be written through the same page/revision and
rendering services as user-authored content, with published revisions and
normal permissions.

**Alternatives considered**:

- Static bundled documentation pages outside the wiki: rejected because they
  would not exercise Markdown rendering, history, search, or page navigation.
- Database seed only: rejected because the Admin must choose whether to create
  examples during onboarding and retries must be idempotent.

## Decision: Generate three canonical sample paths

**Rationale**: The existing welcome page path is `welcome`. Adding
`help/markdown-syntax` and `help/main-features` gives discoverable, tree-shaped
help pages without crowding the root. The welcome page links to both pages and
is enriched instead of duplicated.

**Alternatives considered**:

- Put all help content in `welcome`: rejected because it becomes too large and
  does not demonstrate page navigation/internal links.
- Use root-level `markdown` and `features`: rejected because help pages should
  be grouped and leave the root less noisy.

## Decision: Public content cache invalidation follows existing page mutation rules

**Rationale**: Optional sample pages change anonymous published bodies,
metadata, and navigation. The setup sample-page writer must invalidate the
public content tag and affected paths through the existing cache helper after
creating or updating pages.

**Alternatives considered**:

- Do nothing and rely on time-based cache expiry: rejected because onboarding
  should show created pages immediately.
- Make sample pages dynamic: rejected because public reading must stay
  static/ISR by default.

## Decision: No new runtime dependency

**Rationale**: Existing dependencies cover the UI, forms, schemas, database,
jobs, encryption, Markdown rendering, and AI provider access. Adding libraries
would increase the deployment surface without solving a new problem.

**Alternatives considered**:

- Add a wizard/state-machine library: rejected because the flow has a small,
  explicit number of steps and server state is the source of truth.
