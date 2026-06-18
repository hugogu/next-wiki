# Tasks: User Center & API Keys

**Input**: Design documents from `/specs/002-user-center-api-keys/`
**Prerequisites**: plan.md (required), spec.md (required), data-model.md (required), contracts/ (required)

**Tests**: Test tasks are marked `[P]` (parallelizable) and `[T]` (test). Per
`AGENTS.md`: "Always write unit tests and integration tests for new code changes."
Tests are inline with their feature phase, not deferred to the end.

**Organization**: Tasks are grouped by user story (spec.md US1–US5) plus setup
and polish phases. File paths follow the non-negotiable layout in
`docs/architecture/project-structure.md`.

## Format: `[ID] [P?] [T?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[T]**: Test task
- **[Story]**: Which user story (US1–US5); setup/foundational/polish phases have no story label
- Every task includes an exact file path

## Path Conventions

Monorepo per constitution: `apps/web/` (Next.js full-stack), `packages/shared/`
(Zod schemas + types). Server-only code under `apps/web/src/server/` (never
imported by client code).

---

## Phase 1: Schema & Migration (Foundational — BLOCKS ALL)

**Purpose**: Database schema increments for API keys, audit entries, and user
preference columns.

- [x] T073 [P] Add `apiKeyScopeEnum` to `apps/web/src/server/db/schema/enums.ts`:
  `pgEnum('api_key_scope', ['view', 'create', 'edit', 'delete', 'share', 'run'])`
- [x] T074 [P] Add `apiKeys` and `apiAuditEntries` table schemas + relations to
  `apps/web/src/server/db/schema/index.ts` (per data-model.md: `api_keys` with
  `id`, `user_id`, `name`, `scopes` (text array), `key_prefix`, `key_secret_encrypted`,
  `created_at`, `revoked_at`, `last_used_at`; `api_audit_entries` with `id`,
  `key_id`, `user_id`, `method`, `path`, `status_code`, `duration_ms`,
  `auth_status`, `error_message`, `created_at`). Add `theme_preference` and
  `locale_preference` nullable text columns to existing `users` schema. Add
  indexes per data-model.md.
- [x] T075 Generate Drizzle migration: `pnpm db:generate` — produces
  `0002_*.sql` with `ALTER TABLE users ADD COLUMN` + `CREATE TABLE api_keys` +
  `CREATE TABLE api_audit_entries` + indexes. Verify SQL is idempotent.

**Checkpoint**: Migration applies cleanly on existing DB; new tables exist.

---

## Phase 2: Core Infrastructure (BLOCKS ALL USER STORIES)

**Purpose**: Shared infrastructure for auth, encryption, permissions, audit
wrapper, and shared schemas.

- [x] T076 [P] Add `API_KEY_ENCRYPTION_KEY` to `apps/web/src/server/config.ts`
  env schema: `z.string().min(64).max(64)` (32-byte hex). Dev default:
  `'0'.repeat(64)` (clearly marked dev-only). Production: required, fails fast.
- [x] T077 [P] Create `apps/web/src/server/crypto/key-encryption.ts`:
  `encryptKey(plaintext: string): string` (AES-256-GCM, random 12-byte nonce,
  returns `base64(nonce || ciphertext || tag)`),
  `decryptKey(encrypted: string): string` (reverse). Uses `crypto.createCipheriv`
  / `createDecipheriv` with the env key. No external dependency.
- [x] T078 [P] Add shared Zod schemas to `packages/shared/src/`:
  - `api-keys.ts`: `apiKeyScopeSchema`, `createApiKeyInputSchema`,
    `apiKeyViewSchema`, `apiKeyCreatedSchema`, `apiKeyRevealSchema`
  - `user-center.ts`: `updateProfileInputSchema`, `changeEmailInputSchema`,
    `changePasswordInputSchema`, `updatePreferencesInputSchema`
  - `audit.ts`: `auditEntrySchema`, `auditListResponseSchema`,
    `auditQueryParamsSchema`
  - Update `index.ts` to re-export all new schemas
- [x] T079 [P] Extend `Actor` type in `apps/web/src/server/permissions/index.ts`:
  add `{ kind: 'api_key', userId: string, role: 'admin'|'editor'|'reader',
  scopes: ApiKeyScope[], keyId: string }` to the discriminated union. Extend
  `can()`: for `api_key` actors, (1) check scope-to-action mapping (plan D2),
  deny if scope not present; (2) fall through to normal role + authorship check.
  `manage_users` always denied for `api_key`. Add `buildApiKeyCtx()` helper.
- [x] T080 [P] Create `apps/web/src/server/services/api-keys.ts`:
  `create(ctx, name, scopes)` — generates key (`nwk_` + base64url(32 bytes)),
  encrypts secret, stores prefix + encrypted secret. The prefix has a unique
  DB index, so `create` must handle the astronomically rare prefix collision
  by regenerating the key (retry up to 3 times). Enforces per-user max (10),
  returns `{ keySecret, ...view }`. `list(ctx)` — returns user's keys (without
  secret). `reveal(ctx, keyId)` — decrypts and returns secret. `revoke(ctx,
  keyId)` — sets `revoked_at`. `lookupByToken(token)` — extracts prefix,
  queries by prefix, decrypts, constant-time compare, returns resolved key
  or null. Updates `last_used_at` on successful lookup; note that this is a
  separate write on every key-authenticated request, distinct from the audit
  log write.
- [x] T081 [P] Create `apps/web/src/server/services/audit.ts`:
  `writeEntry({ keyId, userId, method, path, statusCode, durationMs,
  authStatus, errorMessage })` — inserts audit row (fire-and-forget).
  `listOwn(ctx, { keyId?, status?, page, pageSize })` — paginated query for
  user's own entries. `listAll(ctx, { userId?, keyId?, status?, method?, path?,
  startTime?, endTime?, page, pageSize })` — admin-only paginated query across
  all users.
- [x] T082 Create `apps/web/src/server/services/user-center.ts`:
  `updateProfile(ctx, displayName)`, `changeEmail(ctx, email)` (validates
  uniqueness, throws CONFLICT), `changePassword(ctx, currentPassword,
  newPassword)` (bcrypt compare + hash), `updatePreferences(ctx, theme?,
  locale?)`, `getPreferences(ctx)` — all session-only (reject `api_key` actor).
- [x] T083 Modify `apps/web/src/server/services/auth.ts`:
  Add `resolveActor()` — checks `headers().get('authorization')` for Bearer
  token first; if present, calls `apiKeys.lookupByToken()`; if resolved, checks
  user status (disabled → reject), returns `{ actor: { kind: 'api_key', ... },
  apiKeyInfo: { keyId, userId }, authError: null }`. If Bearer present but
  invalid, returns `{ actor: null, apiKeyInfo: null, authError: '<reason>' }`
  (the caller returns 401; no session fallback). If no Bearer, falls back to
  `getCurrentActor()` (session). `getCurrentActor()` remains for backward
  compat (calls `resolveActor()` and falls back to anonymous).
- [x] T084 Modify `apps/web/src/server/api/session.ts`:
  Create `apps/web/src/server/api/api-context-store.ts` with an
  `AsyncLocalStorage<PermCtx & { apiKeyInfo?, authError? }>`. `createApiContext()`
  checks the store first: if a store exists (set by `withApiAudit`), return it;
  otherwise call `resolveActor()` and return the context. This avoids a second
  DB lookup when the audit wrapper has already resolved the actor.
- [x] T085 [P] Create `apps/web/src/server/api/audit-wrapper.ts`:
  `withApiAudit(handler)` HOF — wraps a route handler. Records start time,
  extracts Bearer header. Resolves the actor via `resolveActor()`; if Bearer
  resolution fails, returns 401 and writes the audit entry immediately (handler
  is not called). If resolution succeeds, runs the handler inside the
  `AsyncLocalStorage` store set by `api-context-store.ts` so the handler's
  `createApiContext()` reuses the resolved context. After the handler completes,
  writes an audit entry with key info (resolved or null), method, path, status
  code, duration, auth status, error message. Returns the original response
  unchanged.
- [x] T086 [P] Update `docker-compose.yml`: add `API_KEY_ENCRYPTION_KEY`
  environment variable to the `web` service (dev default or generate one).

**Checkpoint**: Crypto works, auth resolves Bearer tokens, `can()` handles API
key actors, audit wrapper exists, shared schemas compile, env validates.

---

## Phase 3: User Story 1 — User Center & Profile (Priority: P1) 🎯 MVP

**Goal**: A signed-in user can manage their nickname, email, password, and
display preferences from a User Center.

**Independent Test**: Sign in, open User Center, change nickname → appears in
header immediately. Change email → can sign in with new email. Change password
→ can sign in with new password. Set theme/language → persists across refresh,
re-login, and a different browser.

### Implementation

- [x] T087 [P] [US1] REST route `PATCH /api/user/profile` in
  `apps/web/app/api/user/profile/route.ts` — updates display name. Session-only.
- [x] T088 [P] [US1] REST route `PATCH /api/user/email` in
  `apps/web/app/api/user/email/route.ts` — changes email (immediate, no re-auth).
  Handles CONFLICT for duplicate email.
- [x] T089 [P] [US1] REST route `POST /api/user/password` in
  `apps/web/app/api/user/password/route.ts` — changes password (requires
  currentPassword). Returns 401 for incorrect current password.
- [x] T090 [P] [US1] REST route `PATCH /api/user/preferences` in
  `apps/web/app/api/user/preferences/route.ts` — updates theme + locale
  preferences on the user record.
- [x] T091 [US1] User Center layout in `apps/web/app/(user)/user-center/layout.tsx`
  — RSC: calls `getCurrentActor()`, redirects anonymous to `/auth/login`.
  Renders sidebar/tab navigation linking to the four sections. Uses existing
  `<Layout>` wrapper.
- [x] T092 [US1] User Center index in `apps/web/app/(user)/user-center/page.tsx`
  — redirects to `/user-center/profile`.
- [x] T093 [US1] Profile page in `apps/web/app/(user)/user-center/profile/page.tsx`
  — RSC: loads current user. Renders `ProfileForm` (nickname, email) and
  `PasswordChangeForm`. Client components call the REST API on submit.
- [x] T094 [P] [US1] `ProfileForm` component in
  `apps/web/src/components/user-center/ProfileForm.tsx` — React Hook Form +
  Zod. Fields: displayName, email. On success: `router.refresh()` to reflect
  changes immediately.
- [x] T095 [P] [US1] `PasswordChangeForm` component in
  `apps/web/src/components/user-center/PasswordChangeForm.tsx` — Fields:
  currentPassword, newPassword, confirmPassword. Shows error for incorrect
  current password. Clears `mustResetPassword` flag on success.
- [x] T096 [US1] Preferences page in
  `apps/web/app/(user)/user-center/preferences/page.tsx` — RSC: loads current
  preferences. Renders `PreferencesForm` (theme selector + language selector).
- [x] T097 [P] [US1] `PreferencesForm` component in
  `apps/web/src/components/user-center/PreferencesForm.tsx` — Theme radio
  (light/dark/auto) + language radio (English/Chinese). On change: calls
  `PATCH /api/user/preferences` AND updates client-side `ThemeProvider` /
  `I18nProvider` immediately for instant feedback.
- [x] T098 [P] [US1] Modify `apps/web/src/components/layout/Header.tsx` — add
  "User Center" link (user icon) visible to all signed-in users. Links to
  `/user-center`.
- [x] T099 [US1] Modify `apps/web/app/layout.tsx` — read signed-in user's
  `theme_preference` and `locale_preference` from DB (if signed-in) and pass
  as initial values to `ThemeProvider` and `I18nProvider`. Add inline
  `<script>` for flash prevention (reads localStorage before hydration).
- [x] T100 [P] [US1] Modify `apps/web/src/components/theme/ThemeProvider.tsx`
  — accept `initialMode` prop from server. If provided, use it as the initial
  state instead of localStorage. Keep localStorage as fast-init fallback.
- [x] T101 [P] [US1] Modify `apps/web/src/components/i18n/client.tsx`
  (`I18nProvider`) — accept `initialLocale` prop from server. If provided, use
  it as initial state. (Note: already supported; verified.)
- [x] T102 [P] [US1] Modify `apps/web/src/components/layout/Header.tsx`
  `ThemeToggle` and `LanguageSwitcher` — when signed in, also write to the
  server via `PATCH /api/user/preferences` (fire-and-forget) in addition to
  client state.
- [x] T103 [P] [US1] [T] Add i18n keys to `apps/web/src/i18n/locales/en.ts`:
  `userCenter.*` (title, nav.profile, nav.preferences, nav.apiKeys, nav.audit),
  `profile.*` (displayName, email, password, currentPassword, newPassword,
  confirmPassword, changePassword, save, saved), `preferences.*` (theme,
  language, light, dark, auto, english, chinese). Mirror ALL keys in `zh.ts`.
- [x] T104 [P] [US1] [T] Unit tests in
  `apps/web/src/server/services/user-center.test.ts`: `updateProfile` saves
  display name; `changeEmail` rejects duplicate (CONFLICT); `changePassword`
  rejects incorrect current password; `updatePreferences` saves theme + locale;
  all reject `api_key` actor (session-only).

**Checkpoint**: User Center is usable — profile, email, password, and
preferences work end-to-end. Theme/language persist across browsers.

---

## Phase 4: User Story 2 — OpenAPI Documentation (Priority: P2)

**Goal**: A developer can browse interactive API docs at `/api-docs`, see all
endpoints with schemas, and try read endpoints inline.

**Independent Test**: Open `/api-docs` in a browser (no login) → see all REST
endpoints → expand one → see request/response schema → execute a GET → see live
response.

### Implementation

- [x] T105 [P] [US2] Install `next-openapi-gen` as a dev dependency in
  `apps/web/package.json`. Configure in `next.config.ts` or a standalone config
  file per the library's docs.
- [x] T106 [P] [US2] Create `apps/web/src/server/api/openapi.ts` — integrate
  with `next-openapi-gen` to generate an OpenAPI 3.1 document from route
  definitions + Zod schemas. Reuse all shared schemas from `packages/shared`.
  Generate at build time.
- [x] T107 [P] [US2] REST route `GET /api/openapi.json` in
  `apps/web/app/api/openapi.json/route.ts` — serves the generated OpenAPI spec
  as JSON. Public (no auth).
- [x] T108 [US2] API docs page in `apps/web/app/api-docs/page.tsx` — public
  page. Renders an interactive OpenAPI viewer (Scalar or Swagger UI). Loads
  `/api/openapi.json`. Allows inline execution of read endpoints (FR-019).
- [x] T109 [P] [US2] `ApiDocsViewer` component in
  `apps/web/src/components/api-docs/ApiDocsViewer.tsx` — client component
  rendering the interactive docs. Configures the viewer with the API base URL.
- [x] T110 [P] [US2] Add OpenAPI metadata to existing route handlers — annotate
  each `/api/**` route with `next-openapi-gen` decorators or metadata exports
  (summary, description, tags, parameters, request/response schemas). There are
  18 existing route files (6 auth + 11 content/admin + 1 preview); the 11
  content/admin route files plus new 002 routes need metadata.
- [x] T111 [P] [US2] Add "API Docs" link to header (or footer) visible to all
  visitors including anonymous.
- [x] T112 [P] [US2] [T] Add i18n keys for `/api-docs` page title and any
  viewer UI strings to `en.ts` + `zh.ts`.

**Checkpoint**: `/api-docs` shows all endpoints with correct schemas. Inline
execution works for read endpoints.

---

## Phase 5: User Story 3 — API Keys (Priority: P2)

**Goal**: A user can generate API keys with scopes, use them to authenticate
REST calls, reveal keys, and revoke them.

**Independent Test**: Sign in → User Center → API Keys → create "my-bot" with
`view` scope → copy key → `curl -H "Authorization: Bearer <key>" /api/pages`
→ receive page list → try `DELETE /api/pages/{path}` → receive 403 → revoke
key → subsequent calls return 401.

### Implementation

- [x] T113 [P] [US3] REST route `GET /api/api-keys` in
  `apps/web/app/api/api-keys/route.ts` — lists user's keys (without secrets).
  Session-only.
- [x] T114 [P] [US3] REST route `POST /api/api-keys` in
  `apps/web/app/api/api-keys/route.ts` — creates a new key. Returns full secret
  at creation time. Validates name + scopes + per-user max. Wraps with
  `withApiAudit` (key management routes are NOT audited — only content routes
  are audited).
- [x] T115 [P] [US3] REST route `GET /api/api-keys/[id]/reveal` in
  `apps/web/app/api/api-keys/[id]/reveal/route.ts` — reveals full key secret.
  Session-only. Owner check.
- [x] T116 [P] [US3] REST route `DELETE /api/api-keys/[id]` in
  `apps/web/app/api/api-keys/[id]/route.ts` — revokes key. Session-only. Owner
  check.
- [x] T117 [US3] API Keys page in
  `apps/web/app/(user)/user-center/api-keys/page.tsx` — RSC: loads key list.
  Renders `ApiKeyList` with create button, reveal toggle, revoke action.
- [x] T118 [P] [US3] `ApiKeyList` component in
  `apps/web/src/components/user-center/ApiKeyList.tsx` — table showing name,
  scopes (as badges), key prefix, created date, last used, status. "Show"
  button per row calls reveal endpoint. "Revoke" button with confirmation.
- [x] T119 [P] [US3] `ApiKeyCreateDialog` component in
  `apps/web/src/components/user-center/ApiKeyCreateDialog.tsx` — modal form:
  name input + scope checkboxes (view, create, edit, delete, share, run with
  descriptions). On submit: POST, show full key once with copy button, warn
  that the key is stored encrypted and can be revealed later.
- [x] T120 [P] [US3] `ApiKeyReveal` component in
  `apps/web/src/components/user-center/ApiKeyReveal.tsx` — shows the revealed
  key with a copy button. Auto-hides after 30 seconds (shoulder-surfing
  prevention).
- [x] T121 [US3] Apply `withApiAudit` wrapper to all existing `/api/**` route
  handlers except `/api/auth/**` (6 files, session-only) and `/api/preview`
  (1 file, no auth). That is 11 content/admin route files; apply as a one-line
  change per export: `export const GET = withApiAudit(originalHandler)`.
- [x] T122 [P] [US3] [T] Unit tests in
  `apps/web/src/server/services/api-keys.test.ts`: `create` generates key with
  correct prefix + encrypts secret; `lookupByToken` resolves valid key and
  rejects invalid/revoked; `reveal` decrypts correctly; `revoke` sets
  `revoked_at`; per-user max enforced.
- [x] T123 [P] [US3] [T] Unit tests in
  `apps/web/src/server/permissions/index.test.ts` (extend existing): `api_key`
  actor with `view` scope can `read` but not `create`; `api_key` with `create`
  scope owned by reader is denied `create` (scope ∩ role); `manage_users`
  always denied for `api_key`.
- [x] T124 [P] [US3] [T] Add i18n keys to `en.ts` + `zh.ts`: `apiKeys.*`
  (title, create, name, scopes, keyPrefix, createdAt, lastUsed, status.active,
  status.revoked, reveal, hide, copy, copied, revoke, revokeConfirm, revokeWarning,
  scope.view, scope.create, scope.edit, scope.delete, scope.share, scope.run,
  scopeDescriptions.*, maxKeysExceeded, atLeastOneScope).

**Checkpoint**: API keys work end-to-end — create, use via Bearer, reveal,
revoke. Audit entries are recorded for key-authenticated requests.

---

## Phase 6: User Story 4 — Personal Audit Log (Priority: P3)

**Goal**: A key owner can see a history of API calls made with their keys.

**Independent Test**: Sign in → make several API calls with a key (including
one that errors) → User Center → Audit → see those calls with method, path,
status, duration, timestamp.

### Implementation

- [x] T125 [P] [US4] REST route `GET /api/audit` in
  `apps/web/app/api/audit/route.ts` — paginated list of own audit entries.
  Supports `keyId`, `status`, `page`, `pageSize` query params. Session-only.
- [x] T126 [US4] Audit page in `apps/web/app/(user)/user-center/audit/page.tsx`
  — RSC: loads first page of audit entries. Renders `AuditLogTable` with
  filter controls.
- [x] T127 [P] [US4] `AuditLogTable` component in
  `apps/web/src/components/user-center/AuditLogTable.tsx` — paginated table:
  method, path, status code (color-coded: green 2xx, yellow 4xx, red 5xx),
  duration, key name, timestamp. Filter by key (dropdown), status (success/error).
  Pagination controls.
- [x] T128 [P] [US4] [T] Unit tests in
  `apps/web/src/server/services/audit.test.ts`: `listOwn` returns only the
  user's entries (no cross-user leak); `listOwn` with `keyId` filter narrows
  correctly; `listOwn` with `status=error` returns only 4xx/5xx.
- [x] T129 [P] [US4] [T] Add i18n keys to `en.ts` + `zh.ts`: `audit.*`
  (title, method, path, status, duration, timestamp, keyName, errorMessage,
  filterByKey, filterByStatus, all, success, error, noEntries, page, of, next,
  prev).

**Checkpoint**: Personal audit log shows key-authenticated calls with filters.

---

## Phase 7: User Story 5 — Admin Audit Log (Priority: P3)

**Goal**: An admin can view and query all API audit entries across all users.

**Independent Test**: Sign in as admin → Admin → API Audit → see all calls
across all users → filter by user → filter by error status → filter by time
range → confirm each filter narrows results.

### Implementation

- [x] T130 [P] [US5] REST route `GET /api/audit/all` in
  `apps/web/app/api/audit/all/route.ts` — admin-only paginated list. Supports
  `userId`, `keyId`, `status`, `method`, `path`, `startTime`, `endTime`,
  `page`, `pageSize`. Non-admin → 404 (no leak). Session-only.
- [x] T131 [US5] Admin audit page in
  `apps/web/app/(admin)/admin/api-audit/page.tsx` — RSC: calls
  `audit.listAllSafe(ctx)` (returns null if not admin → `notFound()`). Renders
  `AdminAuditTable` with full filter controls.
- [x] T132 [P] [US5] `AdminAuditTable` component in
  `apps/web/src/components/admin/AdminAuditTable.tsx` — paginated table:
  user email, key name, method, path, status, duration, auth status, error
  message, timestamp. Filters: user, key, status, method, path prefix, time
  range. Color-coded status codes.
- [x] T133 [P] [US5] Modify `apps/web/src/components/layout/Navigator.tsx` —
  add `/admin/api-audit` to `ADMIN_ITEMS` array (alongside `/admin/users`).
- [x] T134 [P] [US5] [T] Unit tests in
  `apps/web/src/server/services/audit.test.ts` (extend): `listAll` requires
  admin (non-admin throws FORBIDDEN); `listAll` with `userId` filter narrows;
  `listAll` with time range filter narrows; `listAll` includes entries from
  all users.
- [x] T135 [P] [US5] [T] Add i18n keys to `en.ts` + `zh.ts`: `admin.apiAudit.*`
  (title, user, keyName, method, path, status, duration, authStatus, timestamp,
  errorMessage, filterByUser, filterByTimeRange, from, to, allUsers, allKeys).

**Checkpoint**: Admin audit page shows all entries with working filters.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: E2E tests, Docker verification, accessibility, lint/typecheck.

- [x] T136 [P] [T] Playwright E2E `apps/web/e2e/user-center.spec.ts`: sign in
  → User Center → change nickname → verify in header → change email →
  re-login with new email → change password → re-login → set preferences →
  verify persists across refresh and new browser session.
- [x] T137 [P] [T] Playwright E2E `apps/web/e2e/api-keys.spec.ts`: sign in →
  create key with `view` scope → use key via curl/fetch to GET /api/pages
  (success) → POST /api/pages (403 scope denied) → create key with `create`
  scope as reader → POST (403 role denied) → revoke key → subsequent call
  (401) → audit log shows all attempts.
- [x] T138 [P] [T] Playwright E2E `apps/web/e2e/api-docs.spec.ts`: open
  `/api-docs` (no login) → see endpoint list → expand an endpoint → see schema
  → execute a GET inline → see live response.
- [x] T139 [P] [T] Playwright E2E `apps/web/e2e/admin-audit.spec.ts`: admin
  sign in → admin audit page → see all entries → filter by user → filter by
  error status → non-admin attempts URL → 404.
- [x] T140 [P] Accessibility pass: User Center pages, API docs page, admin
  audit page — semantic headings, form labels, keyboard navigation, visible
  focus.
- [x] T141 [P] Update `.env.example` with `API_KEY_ENCRYPTION_KEY` and
  documentation comment.
- [x] T142 Run `pnpm typecheck` and `pnpm lint` — fix all errors and warnings.
- [x] T143 Run `pnpm test` (Vitest) — all unit/integration tests pass.
- [x] T144 Docker build verification: `docker compose up --build` — healthy
  app with working User Center, API docs, and key generation within 5 minutes.
- [x] T145 Update OpenSpec docs (`spec.md`, `tasks.md`) to reflect any
  implementation deviations discovered during development.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Schema)**: No dependencies — start immediately.
- **Phase 2 (Infrastructure)**: Depends on Phase 1. BLOCKS all user stories.
- **Phase 3 (US1 User Center)**: Depends on Phase 2. Independent of other stories.
- **Phase 4 (US2 OpenAPI Docs)**: Depends on Phase 2. Independent of US1.
  Can run in parallel with US1.
- **Phase 5 (US3 API Keys)**: Depends on Phase 2. Can run in parallel with
  US1/US2 but audit wrapper (T121) should be applied after US1 routes exist
  (to avoid conflicts).
- **Phase 6 (US4 Personal Audit)**: Depends on Phase 5 (audit entries exist).
- **Phase 7 (US5 Admin Audit)**: Depends on Phase 5 (audit entries exist).
  Can run in parallel with US4.
- **Phase 8 (Polish)**: Depends on all user stories being complete.

### User Story Dependencies

- **US1 (P1)**: After Phase 2. No dependency on other stories.
- **US2 (P2)**: After Phase 2. Independent.
- **US3 (P2)**: After Phase 2. Audit wrapper touches existing routes but
  doesn't depend on US1/US2 being complete.
- **US4 (P3)**: After US3 (needs audit entries from key-authenticated calls).
- **US5 (P3)**: After US3. Can run in parallel with US4.

### Within Each User Story

- Service layer before REST route handlers.
- REST route handlers before client components.
- Routes before their tests/E2E.
- i18n keys before UI components that use them.

### Parallel Opportunities

- All Phase 1 tasks marked `[P]` can run in parallel (enums, schema, migration).
- All Phase 2 tasks marked `[P]` can run in parallel (crypto, config, schemas,
  permissions, services). T083/T084 are sequential (auth → session).
- Once Phase 2 is complete, US1, US2, and US3 can proceed in parallel by
  different developers.
- US4 and US5 can proceed in parallel once US3 exists.
- All i18n key tasks (`[T]` with i18n) can run in parallel across stories.

---

## Implementation Strategy

### MVP First (US1 only)

1. Complete Phase 1: Schema & Migration
2. Complete Phase 2: Core Infrastructure
3. Complete Phase 3: US1 (User Center & Profile)
4. **STOP and VALIDATE**: A user can manage their profile, email, password, and
   preferences from the User Center, persisting across browsers.

### Incremental Delivery

1. Schema + Infrastructure → Foundation ready.
2. Add US1 → Test independently → User Center works.
3. Add US2 → Test independently → API docs are live.
4. Add US3 → Test independently → API keys + audit wrapper.
5. Add US4 → Test independently → Personal audit log.
6. Add US5 → Test independently → Admin audit log.
7. Polish → E2E suites, a11y, Docker verification.

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks.
- `[USx]` label maps a task to its user story for traceability.
- Every mutation runs in a Drizzle transaction where atomicity is needed.
- Every data-fetch accepts a permission context and goes through `can()` —
  no permission checks in routes/components.
- API key auth is transparent: existing routes work unchanged for session
  auth; the `withApiAudit` wrapper is a one-line addition per export.
- No-SPA contract (P12) is verified by Playwright navigation for all new routes.
- Verify the Docker build (T144) before declaring the feature done.
- The `API_KEY_ENCRYPTION_KEY` must be set in `docker-compose.yml` before
  `docker compose up` or the app will fail Zod validation at boot.
