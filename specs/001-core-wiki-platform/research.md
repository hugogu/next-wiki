# Phase 0 Research: Core Wiki Platform

**Feature**: `001-core-wiki-platform`
**Date**: 2026-06-14
**Status**: Complete — no NEEDS CLARIFICATION markers existed in the spec.
This document records the key design decisions, rationale, and alternatives
considered before producing `data-model.md` and `contracts/`.

All decisions conform to the project constitution v1.3.0 and its
`docs/architecture/` mandates.

---

## D1 — Render Markdown to HTML at save time; serve stored HTML on reads

**Decision**: Authoring stores raw Markdown source on the revision row. At save,
the rendering pipeline (`source -> parse -> transform[] -> render`, remark +
rehype) produces HTML that is **also stored on the revision row** (`content_html`),
keyed by `content_hash`. Page reads are React Server Components that fetch the
live revision and stream its `content_html` with no client-side data fetch and
minimal client JS.

**Rationale**: Matches spec FR-005/FR-008 ("pre-rendered content with minimal
dynamic behavior", "render at save time"). Satisfies the constitution's
rendering-pipeline mandate ("executable server-side and cacheable per revision
hash") — storing HTML keyed by hash *is* the per-revision cache. Reads are
cheap, fast, cache-friendly, and inherently SEO/share-friendly.

**Alternatives considered**:
- *Render at read time with an in-memory cache*: simpler writes, but every read
  re-runs the pipeline (or needs a separate cache invalidation layer) and
  reintroduces dynamic work on the read path the spec explicitly wants to avoid.
- *Static export / full SSG*: overkill for a database-backed wiki with a
  draft/publish workflow and per-request permission checks; would duplicate the
  source-of-truth into the filesystem.
- *Client-side render of Markdown*: rejected outright — contradicts FR-005/FR-006
  and P12 (would require shipping the page payload + a client parser; SPA-like).

## D2 — Auth: Better Auth, database-backed sessions, email/password only

**Decision**: Better Auth with the Drizzle adapter, local email/password only.
Sessions are **database-backed** (a `session` row per login), not stateless JWTs.

**Rationale**: Constitution mandates Better Auth and "local email/password is the
baseline". Database sessions let us invalidate/reflect role changes on the next
request (D8) and support admin-initiated force-logout implicitly. No email/SMS
provider — keeps the single-service/single-DB constraint (spec A4).

**Alternatives considered**:
- *Stateless JWT sessions*: cannot reflect mid-session role changes without
  short lifetimes + refresh machinery; worse fit for an admin-managed user base.
- *Email-based password reset*: rejected — requires an external mail service,
  violating P1/spec A4. Admin-initiated reset (D9) covers account recovery.

## D3 — Permission chokepoint: one `can(actor, action, resource)` function

**Decision**: A single server-side permission service exposes
`can(actor, action, resource)` returning a boolean, plus builders for permission
contexts. Every data-fetching/service function accepts a permission context and
calls `can()` before returning or mutating. For this slice, `can()` resolves
from: explicit role (admin > editor > reader), authorship (author of a draft),
and the configurable anonymous-read default. No per-page permission entries are
populated; the function signature is shaped so they can be layered later without
touching call sites.

**Rationale**: Satisfies P4 ("every data-fetching function MUST accept a
permission context") and the Permission Model mandate ("no hardcoded admin
bypass"). Centralizing avoids leaky checks and makes the deferred per-page
entries a service-internal change.

**Alternatives considered**:
- *Role checks scattered in routes*: exactly the anti-pattern P4 forbids.
- *A full permission_entry table now*: unused in this slice's acceptance tests;
  deferred per spec A7 (see Complexity Tracking).

## D4 — Draft/Publish version model (version-level)

**Decision**: Every save creates a new `page_revision` with `status = 'draft'`.
Publishing sets one revision's status to `'published'` (and, for this single-
locale slice, marks it the page's live revision). The page's **live content** is
its most-recent `published` revision (tracked by `pages.current_published_version_id`).
Readers see the live revision; authors see all revisions of pages they authored;
drafts of any page are visible only to their author (and admins).

**Rationale**: Confirmed in clarification Q2 / assumption A1. Keeps published
content stable while an author drafts the next version; "未发布的（版本）只有其作者
可以访问" is honored at the revision level.

**Alternatives considered**:
- *Page-level publish (edit published → goes live immediately)*: simpler, but
  rejected — cannot draft changes to live pages and does not match the
  "(版本)" wording.

## D5 — Concurrent edits: last-write-wins, full history

**Decision**: No optimistic-concurrency control. Two editors editing the same
draft each save their own revision; the later save becomes the newest revision.
Both are preserved in history. The UI shows "last edited by …" but does not
merge.

**Rationale**: Spec edge case explicitly accepts last-write-wins with history.
CRDT/real-time collaboration is out of scope for v1.x (constitution). Revision
history guarantees no silent data loss.

**Alternatives considered**:
- *Optimistic locking with conflict UI*: adds complexity with little value for
  a small-team wiki in this slice.

## D6 — Page identity, slug, and canonical URL

**Decision**: A page's canonical public key is `(space_id, path, locale)`. For
this slice there is one default space and one default locale, so the
user-facing identifier is the **slug** (author-chosen at creation, validated
URL-safe and unique within the space, immutable). The `path` field equals the
slug (flat, no hierarchy). The public read URL is `/<slug>`.

**Rationale**: Clarification Q5 / A12. Honors P12 (clean RESTful URLs) and the
Page-Tree mandate (path is canonical). Immutability avoids building the redirect
mechanism now; `path` is present so redirects add cleanly later.

**Alternatives considered**:
- *Auto-slug from title*: rejected by user (Q5 → B).
- *Opaque IDs*: rejected — violates the readable-URL intent of P12.

## D7 — First-run admin bootstrap

**Decision**: On startup, if zero admins exist, the app exposes a one-time
first-run setup route (e.g. `/setup`) that creates the initial admin account.
Once an admin exists, the route refuses. This is gated by a DB check, not an
env var, so it self-disables.

**Rationale**: Satisfies P10 ("web first-run flow for creating the initial admin
account"). Keeps deployment to `docker compose up` + visit-the-URL.

**Alternatives considered**:
- *Seed admin from env vars*: leaks a password into the environment and is
  forgettable; less safe than an interactive first-run.
- *CLI bootstrap*: extra operational step beyond one-command deploy.

## D8 — Role changes reflected mid-session

**Decision**: The user's role is read from the `users` row on each request
(through the session → user lookup), not cached in the session payload. A role
change by an admin takes effect on the user's next request.

**Rationale**: Spec edge case ("stale elevated permissions do not persist").
Database sessions (D2) make this trivial and secure.

## D9 — Admin-initiated password reset (no email)

**Decision**: Admin clicks "reset password" for a user; the admin sets a
temporary password (shown once to the admin to relay out-of-band); the user row
is flagged `must_reset_password = true`. On next login the user is forced to set
a new password before reaching the wiki.

**Rationale**: Spec A4. No email dependency → single-service constraint holds.
The `must_reset_password` flag also covers first-run if ever needed.

**Alternatives considered**:
- *Email reset link*: requires external mail service (rejected, P1/A4).

## D10 — Tiptap editor boundary (ProseMirror AST never leaves the browser)

**Decision**: The editor is a client component using Tiptap (ProseMirror). Its
internal AST exists only in the browser. The only thing sent to the server on
save is **serialized raw Markdown**. The server independently parses that raw
Markdown with remark into its own AST for rendering.

**Rationale**: Constitution Editor Extensibility mandate. Keeps two independent
AST systems connected only by raw source; editor format is never stored as HTML.

## D11 — Verifying the no-SPA / browser-navigation contract

**Decision**: A Playwright E2E suite asserts, for each route, that direct URL
entry, refresh, browser back/forward, and "open in new tab" land on the correct
state with no errors. It also asserts GET never mutates (re-fetching a URL is
idempotent) and that 404/403 are real, history-linear routes.

**Rationale**: Spec FR-006 / SC-008 and P12 are testable invariants, not
aspirations. Encoding them in E2E prevents regressions toward SPA-like behavior.

## D12 — Job queue wired but unused by this slice

**Decision**: pg-boss is configured and connected (constitution P6/P10 expect
it, and `/healthz` reports it), but no feature in this slice enqueues jobs — all
operations are synchronous and well under the 500ms threshold.

**Rationale**: Avoids adding a worker container or async UX for no functional
benefit, while keeping the constitution's async-first infrastructure in place
for fast-follows (search reindex, delete retention, AI ingestion).

---

## Summary of resolved decisions

| ID | Topic | Decision |
|---|---|---|
| D1 | Markdown rendering | Render at save; store HTML on revision; serve via RSC |
| D2 | Auth | Better Auth + Drizzle, DB sessions, email/password only |
| D3 | Permissions | Single `can(actor, action, resource)` chokepoint |
| D4 | Versioning | Version-level draft/publish; live = latest published revision |
| D5 | Concurrent edits | Last-write-wins, full history |
| D6 | Page identity | Author-chosen immutable slug; `path` = slug; URL `/<slug>` |
| D7 | First-run admin | One-time `/setup` route gated on zero admins |
| D8 | Role change | Role read from DB per request; no stale elevation |
| D9 | Password reset | Admin sets temp password + `must_reset_password` flag |
| D10 | Editor boundary | Tiptap AST stays in browser; serialize to raw Markdown |
| D11 | No-SPA verification | Playwright asserts native nav contract per route |
| D12 | Job queue | pg-boss wired; no jobs exercised this slice |
