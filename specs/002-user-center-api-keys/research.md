# Phase 0 Research: User Center & API Keys

**Feature**: `002-user-center-api-keys`
**Date**: 2026-06-18
**Status**: Complete — all clarifications resolved (3 questions answered in spec.md).
This document records the key design decisions, rationale, and alternatives
considered before producing `data-model.md`, `contracts/`, and `tasks.md`.

All decisions conform to the project constitution v1.3.0 and its
`docs/architecture/` mandates.

---

## D1 — Unified Actor Resolution: Bearer → Session → Anonymous

**Decision**: Create a single `resolveActor()` function that checks the
`Authorization: Bearer` header first, then falls back to the session cookie,
then returns anonymous. This replaces the current `getCurrentActor()` (which
only reads the session cookie) as the auth entry point for all API routes.

**Rationale**: The current `createApiContext()` calls `getCurrentActor()` — a
single chokepoint for auth. Extending it to also handle Bearer tokens keeps the
"one entry point" invariant (P9) and means every existing route handler gains
API key auth support with zero code changes to the route itself. The service
layer's `can()` call sees the resolved actor (with scopes) and makes the
permission decision.

**Key behavior**: When a Bearer token is present, the API must authenticate
via that token only. If the token is invalid (malformed, no matching key,
revoked, or owned by a disabled user), the request returns **401** and the
session cookie is NOT checked as a fallback. This prevents a broken API key
from silently falling through to a user's browser session and makes auth
failures unambiguous for programmatic clients.

For requests with no Bearer header, session cookie auth proceeds as before
(→ user or anonymous).

**Audit wrapper integration**: `withApiAudit()` resolves the actor **before**
calling the handler. If Bearer resolution fails, it returns 401 immediately
and logs the failed-auth audit entry. If Bearer resolution succeeds, the
resolved context is stored in request-scoped `AsyncLocalStorage` so the
handler's `createApiContext()` can reuse it without a second DB lookup. RSC
pages and non-wrapped routes continue to call `createApiContext()`, which
resolves normally when no ALS store exists.

**Alternatives considered**:
- *Next.js middleware*: Rejected — Next.js middleware runs in the Edge Runtime,
  which has no access to PostgreSQL (Drizzle requires Node runtime). Resolving
  a key requires a DB lookup (prefix → key → user → role). A middleware +
  queue (pg-boss) design would add an async hop and complexity for a sub-ms
  DB lookup.
- *Per-route Bearer check*: Rejected — requires modifying every route handler
  explicitly, violating the "one chokepoint" principle (P4/P9) and creating
  audit gaps if a route is forgotten.
- *Separate API gateway / proxy*: Rejected — violates P1 (single service) and
  adds operational complexity disproportionate to a personal/small-team wiki.
- *Session-only, API keys via separate header*: Rejected — `Authorization:
  Bearer` is the HTTP standard (P8). Inventing a custom header like
  `X-API-Key` is non-standard and breaks the OpenAPI docs "try it" feature
  (FR-019).
- *Wrapper re-running `resolveActor()` after the handler resolves*: Rejected —
  would cause a second DB lookup per Bearer request and a second
  `last_used_at` write. `AsyncLocalStorage` lets the wrapper and handler share
  one resolved context.

---

## D2 — Scope ∩ Role: Extend `can()` with an `api_key` Actor Variant

**Decision**: Extend the `Actor` discriminated union with an `api_key` variant
carrying `{ userId, role, scopes[], keyId }`. Inside `can()`, an `api_key`
actor first checks if the requested action maps to a scope in the key's set;
if yes, it falls through to the normal role + authorship check (same logic as
a `user` actor). If the scope is not present, the action is denied. If the
scope is present but the role denies, the action is denied.

**Rationale**: This naturally implements scope ∩ role (spec FR-013, A1) — both
checks must pass. A key with `create` scope owned by a reader passes step 1
(scope allows `create`) but fails step 2 (reader role denies `create`). The
chokepoint remains the sole interpreter of permissions (P4 mandate). No route
or service needs to know whether the caller authenticated via session or key.

**Scope-to-action mapping**:

| Scope | Maps to `Action` | Rationale |
|---|---|---|
| `view` | `read`, `read_draft` | View = read access (published + drafts if author) |
| `create` | `create` | Create = new pages |
| `edit` | `edit`, `publish` | Edit includes publishing drafts (edit operation) |
| `delete` | `delete` | Delete = page removal |
| `share` | *(none yet)* | Forward-looking (A2); no `share` action exists |
| `run` | *(none yet)* | Forward-looking (A2); no `run` action exists |
| *(no scope)* | `manage_users` | User management is never exposed via API key |

The `publish` action maps to `edit` scope (not a separate `publish` scope)
because publishing is conceptually an edit operation — the author has already
created the draft; publishing makes it live. Splitting `publish` into its own
scope would add granularity the spec doesn't request (FR-007 defines 6 scopes,
not 7).

**Alternatives considered**:
- *Separate permission check for keys (outside `can()`)*: Rejected — creates a
  second permission chokepoint, violating P4. The spec FR-026 explicitly says
  "API key authentication MUST be enforced through the existing permission
  chokepoint (`can()`)."
- *Scope = full permission (ignore role)*: Rejected — spec A1/FR-013 explicitly
  requires intersection. A reader with a `create`-scope key must NOT create
  pages.
- *Role = full permission (ignore scope)*: Rejected — defeats the purpose of
  scoped keys. An admin's key with only `view` scope should only read.
- *Per-resource scope checks (e.g. scope per page)*: Rejected — spec A2 says
  scopes are page-permission scopes, not per-resource. Over-engineered for this
  slice.

---

## D3 — Key Format: `nwk_` Prefix + Base64url(32 bytes) + AES-256-GCM Encrypted Storage

**Decision**:
- **Key format**: `nwk_` + base64url(32 cryptographically random bytes) ≈ 48
  chars total. Example: `nwk_aB3xY9zKqM2vN7rLpX4wTsH6jDfG8cRn`.
- **Visible prefix**: first 12 chars (e.g. `nwk_aB3xY9zK`). Stored in plaintext
  as `key_prefix`. Used for indexed DB lookup during auth and quick visual
  identification in the key list.
- **Encrypted secret**: full key value encrypted with AES-256-GCM using
  `API_KEY_ENCRYPTION_KEY` from env. Stored as `key_secret_encrypted` (text,
  `base64(nonce || ciphertext || tag)`). Reversible on demand (FR-009).
- **Lookup flow**: extract first 12 chars from incoming Bearer token →
  `SELECT WHERE key_prefix = $1 AND revoked_at IS NULL` → decrypt stored
  secret → constant-time compare with incoming token.

**Rationale**: The `nwk_` prefix makes keys visually identifiable in logs,
configs, and audit trails (industry convention: `sk_`, `pk_`, `nwk_`). The
12-char visible prefix provides enough entropy for indexed lookup (8 random
base64url chars = 2^48 ≈ 281 trillion possibilities — collisions are
impossible in practice) while not revealing the full secret. AES-256-GCM is
authenticated encryption: tampering with the ciphertext fails decryption. The
encryption key is server-managed (env var), so a DB compromise alone does not
expose usable plaintext keys (FR-010).

**Why encrypted, not hashed** (clarification Q2): The user explicitly chose
reversible encryption over hash-only/one-time-view. Keys can be revealed later
from the key list (FR-009). This prioritizes ease of use for a personal/small-
team wiki where the threat model is "convenience over strict one-time-view
security." A hash-only approach would require storing the key in the user's
session at creation and showing it once — if they lose it, they must regenerate.
The encrypted approach trades some security (reversible) for usability
(revisitable). The user accepted this trade-off.

**Alternatives considered**:
- *Hash-only (one-time view)*: Rejected per clarification Q2. The user wants
  keys to be revealable later. Hash-only storage (like how passwords are
  stored) means the plaintext is never recoverable; the key is shown once at
  creation and if lost, a new key must be generated. This is the more secure
  approach but was explicitly overridden by the user.
- *Plain text storage*: Rejected — a DB compromise would expose all keys
  directly. Violates FR-010 ("a database compromise alone MUST NOT expose
  usable plaintext keys without the encryption key").
- *Application-level encryption with a KMS*: Rejected — adds an external
  service dependency (AWS KMS, HashiCorp Vault) violating P1 (single service)
  and disproportionate for a personal wiki. The env-var-managed key is
  sufficient: the DB and the encryption key are in different trust domains
  (DB is in a container volume; the encryption key is in the app's env config).
- *Unique index on full encrypted secret*: Rejected — encrypted values are
  non-deterministic (random nonce per encryption), so the same plaintext
  produces different ciphertexts. Lookup by prefix is the correct approach.
- *Longer prefix (16+ chars)*: Considered but unnecessary — 12 chars (8 random)
  provides 2^48 entropy, more than enough to prevent collisions in any
  realistic key volume. A longer prefix leaks more of the key unnecessarily.
- *Shorter prefix (8 chars)*: Considered — 4 random base64url chars = 2^24 ≈
  16M possibilities. For a small-team wiki this might be sufficient, but the
  collision risk grows if keys are generated frequently. 12 chars is a safe
  middle ground.

---

## D4 — Audit Logging: Route-Handler Wrapper (not Middleware, not Interceptor)

**Decision**: A `withApiAudit()` higher-order function wraps route handler
exports. The wrapper records the start time, extracts the Bearer header, calls
the original handler, captures the response status, and — if a Bearer header
was present — inserts an audit entry. The insert is awaited but the response
is already constructed, so the audit insert does not delay the response to the
client (it runs after the response object is created).

**Why not Next.js middleware**: Next.js middleware runs in the Edge Runtime,
which cannot access PostgreSQL. The audit entry requires a DB INSERT (Drizzle
+ `postgres` driver = Node runtime only). A middleware approach would need to
publish to a queue (pg-boss) and have a worker consume — adding an async hop,
a worker container, and operational complexity for what is a single INSERT.

**Why not a custom server / interceptor**: Next.js App Router doesn't support
a custom server without ejecting. An Express/Hono wrapper around the entire
app is possible but breaks the "single Next.js service" deployment (P1).

**Why session-only requests are NOT audited**: Session-authenticated requests
are browser UI interactions (page loads, form submits). Auditing every page
load would flood the audit log with noise and provide little value. Only
API-key-authenticated requests (programmatic access) are audited — this is the
spec's intent (FR-020: "every API request authenticated by an API key"). The
presence of a Bearer header is the signal that this is a programmatic call.

**Fire-and-forget detail**: The audit INSERT is awaited (so we catch errors
in dev/logs) but a failure in the INSERT does NOT fail the API request. The
`withApiAudit` wrapper wraps the INSERT in a try-catch and logs failures
without propagating them. For a small-team wiki, a best-effort audit log is
sufficient (spec A7 accepts this scale).

**Auth status recording**: The wrapper resolves the actor **before** invoking
the handler (via `resolveActor()`), stores the resolved context in
`AsyncLocalStorage`, and passes the same context to the handler. After the
handler completes, the wrapper reads `apiKeyInfo`/`authError` from the stored
context to record the audit entry. This avoids a second DB lookup and ensures
`key_id`, `user_id`, and `auth_status` are recorded accurately (FR-020/FR-021).

**Auth status values**:
- `authenticated` — valid key (request may still return 4xx/5xx from business logic).
- `invalid_key` — Bearer token doesn't match any key.
- `revoked_key` — Bearer token matches a revoked key.
- `disabled_user` — key is valid but owner is disabled.
- `malformed_token` — Bearer header is present but malformed (not `nwk_...`).

**Alternatives considered**:
- *Next.js middleware + pg-boss queue*: See above — Edge Runtime limitation +
  async hop. Rejected for P1/simplicity.
- *Drizzle after-commit hook*: Drizzle doesn't have built-in after-commit hooks
  in the same way Rails does. Manual implementation would be fragile.
- *Audit in the service layer*: Rejected — the service layer doesn't have
  access to HTTP-level details (method, path, status code, duration). These
  are route-handler concerns. Also, not all services are called from API
  routes (some are called from RSC page renders), so auditing at the service
  layer would create false entries.
- *Audit in `createApiContext()`*: Rejected — `createApiContext()` runs before
  the handler, so it can't record the response status code or duration. The
  wrapper runs after the handler completes.
- *Wrapper re-resolving after the handler*: Rejected — causes a redundant DB
  lookup and a redundant `last_used_at` write. `AsyncLocalStorage` shares the
  resolved context between wrapper and handler.

---

## D5 — OpenAPI Generation: next-openapi-gen (User's Explicit Choice)

**Decision**: Use `next-openapi-gen` (https://github.com/tazo90/next-openapi-gen)
to auto-generate an OpenAPI 3.1 specification from Next.js App Router route
definitions and shared Zod schemas. The spec is generated at build time and
served at `/api/openapi.json`. Interactive docs (Scalar or Swagger UI) are
served at `/api-docs`.

**Rationale**: The user explicitly requested this library (spec A9). It reads
Next.js App Router route files and generates an OpenAPI document from route
metadata (parameters, request/response schemas, auth requirements). The shared
Zod schemas in `packages/shared` are reused for both validation and
documentation — no drift (FR-016). The docs are public (FR-018) and allow
inline execution of read endpoints (FR-019).

**Why Scalar over Swagger UI**: Scalar provides a more modern, polished
interactive docs experience with better dark-mode support (matching the wiki's
theme system). Swagger UI is the fallback if Scalar integration issues arise.
This is an implementation detail finalized during development.

**What 001 planned but never built**: The 001 plan (T016) referenced
`apps/web/src/server/api/openapi.ts` and `/api/openapi.json`, but these were
never implemented — the 001 scope was UI-only (no external API consumers).
Feature 002 builds this from scratch.

**Alternatives considered**:
- *Manual OpenAPI YAML*: Rejected — drifts from the implementation immediately.
  FR-016 requires auto-generation from live route definitions.
- *swagger-jsdoc*: Rejected — uses JSDoc comments, which are decoupled from the
  actual Zod schemas used for validation. Can drift.
- *@asteasolutions/zod-to-openapi*: A building block, not a full Next.js
  integration. Would require significant glue code. `next-openapi-gen` likely
  uses it internally.
- *tRPC*: Rejected — the project uses REST + Zod, not tRPC. Switching would
  be a fundamental architecture change, not appropriate for this slice.
- *Hono with Zod OpenAPI*: Rejected — would require moving API routes from
  Next.js App Router to a Hono app. Disproportionate change.

---

## D6 — Server-Side Preference Sync: DB Column + localStorage Fast-Init

**Decision**: Add `theme_preference` and `locale_preference` nullable text
columns to `users`. The root `layout.tsx` (RSC) reads the signed-in user's
preferences from DB and passes them as initial values to `ThemeProvider` and
`I18nProvider`. Client-side `localStorage` remains as a fast-init fallback to
prevent theme flash on first paint. The User Center is the canonical place to
set preferences; the header `ThemeToggle` and `LanguageSwitcher` also write to
the server when signed in.

**Flash prevention**: The root layout renders an inline `<script>` that reads
`localStorage` and applies the theme class to `<html>` before React hydration.
This is the standard SSR theme-flash-prevention technique. On a full page load
(SSR), the server-side preference overrides localStorage — the server is the
source of truth. On client-side navigation (instant), localStorage wins (no
flash) and is synced back to the server on the next preference write.

**Why not cookie-based preference**: Cookies are sent on every HTTP request,
adding bytes to every page load and API call. Preferences are only needed on
page loads (for the initial render), not on API calls. Reading from the DB in
the RSC layout is a single indexed query (user is already fetched for auth).
A cookie would be redundant.

**Why nullable**: Existing users have no preference set. Making the columns
nullable means the migration is non-breaking — existing users fall back to the
client-side default (localStorage or system preference). Only when a user
explicitly sets a preference does the DB value become non-null.

**Anonymous users**: Continue to use localStorage only. No DB preference is
read or written for anonymous users (there is no user record to read from).

**Alternatives considered**:
- *localStorage only (no server-side)*: Rejected — SC-002 requires preferences
  to persist across browsers and devices. localStorage is per-browser; a user
  switching from Chrome to Firefox would lose their preference.
- *Cookie-based preferences*: See above — adds bytes to every request, redundant
  with the DB read that already happens for auth.
- *Separate `user_preferences` table*: Rejected — over-normalized. Two columns
  on `users` is simpler and the query is already part of the auth flow. A
  separate table would require a join for no benefit.
- *JSON column for arbitrary preferences*: Rejected — YAGNI. Two specific
  preferences (theme, locale) are needed now. A JSON column adds parsing
  complexity and loses type safety. New preferences can add columns later.

---

## D7 — User Center UI: Route Group with Sub-Routes (not Tabs on a Single Page)

**Decision**: The User Center is a route group at `/user-center` with sub-routes
for each section (`/profile`, `/preferences`, `/api-keys`, `/audit`). Each
section is a server-rendered page with its own URL. A sidebar/tab navigation
within the User Center provides section switching.

**Rationale**: P12 (Native Web Navigation) requires real, bookmarkable URLs
with working browser history. A single-page tabbed interface would require
client-side state management for tabs and would break deep-linking (you can't
bookmark `/user-center#api-keys` and expect it to work reliably across refresh
and sharing). Separate URLs mean each section is independently linkable,
refreshable, and supports browser back/forward.

**Layout pattern**: A `layout.tsx` in the `(user)/user-center/` directory wraps
all sections. It calls `getCurrentActor()`, redirects anonymous users to
`/auth/login`, and renders the sidebar + content area. This follows the
existing `(admin)/admin/users/page.tsx` pattern from 001.

**Admin audit as a separate route**: The admin API audit page
(`/admin/api-audit`) is under the existing `(admin)` route group, not under
`/user-center`. This is because:
1. It's an admin-only feature, not a self-service feature.
2. It belongs with the existing admin section (`/admin/users`) in the
   navigator sidebar.
3. Putting it under `/user-center/audit` would blur the boundary between
   self-service and admin surfaces.

**API docs as a standalone route**: `/api-docs` is outside both `/user-center`
and `/admin` because it's public (no login required, FR-018). It's a
standalone page with its own layout (no sidebar — just the docs viewer).

**Alternatives considered**:
- *Single page with tabs (client-side state)*: Rejected — violates P12 (no
  deep-linking, no browser history for tab switches).
- *Modal/drawer for profile editing*: Rejected — modals are poor for complex
  forms (password change, API key creation with scope selection). Real URLs
  are more robust.
- *Everything under `/settings/*`*: Considered — but "User Center" is a more
  user-friendly label and matches the spec's language ("用户中心"). The
  `/user-center` prefix is also distinct from `/admin` (admin) and `/settings`
  (could be confused with system config).

---

## D8 — Encryption Key Management: Env Var (Server-Managed, Not in DB)

**Decision**: `API_KEY_ENCRYPTION_KEY` is a 32-byte hex string (64 chars) loaded
from the environment. In production: required — Zod validation in `config.ts`
fails fast if missing. In development: defaults to a well-known dev key
(`'0'.repeat(64)`, clearly marked as dev-only). Added to `docker-compose.yml`
env block.

**Rationale**: The encryption key must be in a different trust domain than the
database (FR-010: "a database compromise alone MUST NOT expose usable plaintext
keys without the encryption key"). If the key were in the DB, a DB compromise
would expose both the encrypted secrets and the key — defeating the purpose.
An env var is managed by the deployment environment (Docker Compose env, k8s
secret, etc.) and is not persisted alongside the data it protects.

**Key rotation**: Not in scope for this slice. The AES-256-GCM scheme with
per-key random nonces supports future rotation: a re-encryption script would
read all `key_secret_encrypted` values, decrypt with the old key, re-encrypt
with the new key, and update the rows. No schema change is needed. The env var
would be swapped and the script run during a maintenance window.

**Why not derive from `DATABASE_URL` or another existing env var**: Rejected —
coupling the encryption key to another secret means compromising one compromises
both. The encryption key should be independently rotatable.

**Why AES-256-GCM specifically**:
- AES-256 is the industry standard for symmetric encryption (NIST-approved).
- GCM (Galois/Counter Mode) provides authenticated encryption — the ciphertext
  includes an authentication tag. Tampering with the ciphertext or nonce
  causes decryption to fail, preventing bit-flipping attacks.
- Node's built-in `crypto` module supports it natively (`createCipheriv`/
  `createDecipheriv` with `aes-256-gcm`). No external dependency.
- A random 12-byte nonce per encryption operation is the NIST-recommended
  practice for GCM.

**Alternatives considered**:
- *AES-256-CBC (no authentication)*: Rejected — CBC doesn't provide
  authentication. An attacker with DB write access could tamper with the
  ciphertext and the decryption would succeed with corrupted plaintext.
- *ChaCha20-Poly1305*: Also excellent and supported by Node's `crypto`. Slightly
  faster in software. Equivalent security. GCM was chosen for broader
  ecosystem familiarity and tooling support.
- *External KMS (AWS KMS, Vault)*: Rejected — adds external service dependency
  (P1 violation), network latency per encrypt/decrypt, and operational
  complexity disproportionate to a personal wiki.
- *Node `crypto.scryptDerive` from a password*: Rejected — key derivation adds
  complexity and the derived key would be deterministic from the password.
  A raw 32-byte hex key is simpler and equally secure.

---

## D9 — API Key Lookup: Prefix-Indexed + Constant-Time Comparison

**Decision**: The key lookup flow is:
1. Extract the first 12 characters of the incoming Bearer token (the
   `key_prefix`).
2. `SELECT * FROM api_keys WHERE key_prefix = $1 AND revoked_at IS NULL` —
   uses the unique index on `key_prefix` for O(1) lookup.
3. Decrypt `key_secret_encrypted` using the server encryption key.
4. Compare the decrypted secret with the incoming token using
   `crypto.timingSafeEqual()` (constant-time comparison to prevent timing
   attacks).
5. If match: update `last_used_at`, resolve the owner, return the key. If no
   match: return null (invalid key).

**Rationale**: A naive approach would be to encrypt the incoming token and
compare with the stored encrypted value. But AES-256-GCM uses a random nonce
per encryption, so the same plaintext produces different ciphertexts — you
can't compare encrypted values. Instead, decrypt the stored value and compare
in constant time. The prefix lookup narrows the candidate set to 0 or 1 row,
so the decrypt + compare happens at most once per request.

**Why prefix lookup works**: The `key_prefix` is the first 12 characters of
the key (e.g. `nwk_aB3xY9zK`). Since the key is `nwk_` + base64url(32 random
bytes), the prefix includes the `nwk_` (4 chars) + 8 random base64url chars.
8 base64url chars = 48 bits of entropy ≈ 281 trillion possibilities. The chance
of two keys sharing a prefix is negligible (birthday paradox: ~50% collision at
2^24 ≈ 16 million keys — far beyond any realistic key volume). The unique
index on `key_prefix` enforces uniqueness at the DB level.

**Timing attack mitigation**: `crypto.timingSafeEqual()` ensures the comparison
takes the same time regardless of how many characters match. This prevents an
attacker from determining the key character-by-character via timing differences.
The prefix lookup is already O(1) (indexed), so the total auth overhead is one
indexed SELECT + one decrypt + one constant-time compare — sub-millisecond.

**Alternatives considered**:
- *Full-table scan with decrypt + compare*: Rejected — O(n) in the number of
  keys. For a small wiki this might be fine, but the prefix index is strictly
  better and costs nothing.
- *Hash the incoming token and compare with a stored hash*: Rejected — we're
  storing encrypted (reversible), not hashed. The whole point is that we can
  reveal the key later. If we also stored a hash for lookup, we'd have two
  representations and the hash would be redundant with the prefix index.
- *Store the full key encrypted, no prefix*: Rejected — without a prefix,
  lookup requires decrypting every key to find a match. The prefix is the
  optimization that makes O(1) lookup possible.

---

## D10 — Audit Entry Timing: Post-Response (Fire-and-Forget)

**Decision**: The `withApiAudit` wrapper calls the handler, constructs the
response, then inserts the audit entry. The insert is awaited (so errors are
caught and logged) but a failure in the insert does NOT fail the API request.
The response is already constructed and will be sent regardless of the audit
insert outcome.

**Rationale**: For a small-team wiki, the audit log is best-effort (spec A7
accepts this scale). The latency of a single INSERT (~0.5ms on local Postgres)
is negligible compared to the handler's execution time. Making the audit
transactional with the request (same DB transaction) would add complexity and
could cause request failures if the audit table is locked or the INSERT fails
(e.g. constraint violation on a malformed entry).

**What about requests that fail before the handler completes?** If the handler
throws an unhandled error, the wrapper catches it, records the audit entry with
`status_code = 500` and `error_message = 'INTERNAL_ERROR'`, then re-throws the
error so Next.js returns a 500. The audit entry is still recorded.

**What about streaming responses?** Next.js App Router supports streaming
responses (RSC streaming, `Response` with `ReadableStream`). The wrapper
captures the status code from the `Response` object (available immediately,
before the stream completes). The audit entry is inserted after the response
object is created but before it's fully streamed — this is fine because the
status code and duration are known at response construction time.

**Alternatives considered**:
- *Same-transaction audit (transactional)*: Rejected — couples audit success to
  request success. If the audit INSERT fails, the request fails. For a wiki,
  this is too strict — the audit log should be best-effort.
- *Async queue (pg-boss)*: Rejected — adds a worker container and async hop
  for a single INSERT. The fire-and-forget approach is simpler and sufficient
  for this scale.
- *Response interceptor (middleware)*: See D4 — not possible with Next.js Edge
  Runtime middleware.

---

## D11 — Profile/Email/Password via Session-Only (Not API Key)

**Decision**: User Center management endpoints (profile, email, password,
preferences) are session-only. API key authentication is rejected for these
endpoints. This means you cannot change your password or email using an API
key — you must be signed in via the browser session.

**Rationale**: API keys are for programmatic wiki content access (read/create/
edit/delete pages). Account management (password, email, preferences) is a
self-service UI concern. Allowing API keys to change passwords or emails
introduces a privilege escalation risk: a leaked key could be used to change
the account's email and then reset the password, taking over the account.
By restricting these endpoints to session auth (browser-only), we ensure
that account management requires the user's active browser session, not just
a leaked token.

The spec doesn't explicitly state this, but it's consistent with the overall
security model: API keys are scoped to page operations (`view`, `create`,
`edit`, `delete`), not account operations. No scope maps to `manage_users` or
profile management (D2).

**Implementation**: The service layer checks `actor.kind === 'user'` (not
`'api_key'`) and throws `FORBIDDEN` for API key actors. This is a simple guard
in the `user-center.ts` service functions.

**Alternatives considered**:
- *Allow API key with a special `account` scope*: Rejected — over-engineered.
  No user story requires programmatic account management. The spec's scopes are
  page-permission scopes (FR-007), not account scopes.
- *Allow API key for profile/preferences but not password*: Rejected —
  inconsistent and confusing. Either keys can manage accounts or they can't.
  Simplicity wins: they can't.

---

## Summary of resolved decisions

| ID | Topic | Decision |
|---|---|---|
| D1 | Actor resolution | Unified `resolveActor()`: Bearer → session → anonymous; invalid Bearer returns 401 (no session fallback) |
| D2 | Scope ∩ role | Extend `can()` with `api_key` actor variant; scope-to-action mapping |
| D3 | Key format & storage | `nwk_` + base64url(32 bytes); AES-256-GCM encrypted; prefix-indexed lookup |
| D4 | Audit logging | `withApiAudit()` wrapper + `AsyncLocalStorage`; resolves actor before handler; post-response INSERT |
| D5 | OpenAPI generation | `next-openapi-gen` (user's choice); build-time spec; Scalar/Swagger UI at `/api-docs` |
| D6 | Preference sync | DB columns + localStorage fast-init; inline `<script>` for flash prevention |
| D7 | User Center UI | Route group with sub-routes; real URLs for each section |
| D8 | Encryption key | Env var `API_KEY_ENCRYPTION_KEY`; AES-256-GCM; dev default for local |
| D9 | Key lookup | Prefix-indexed SELECT + decrypt + constant-time compare |
| D10 | Audit timing | Post-response fire-and-forget; best-effort; does not fail request |
| D11 | Account management auth | Session-only; API keys cannot manage profiles/emails/passwords |
