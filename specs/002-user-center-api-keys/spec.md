# Feature Specification: User Center & API Keys

**Feature Branch**: `002-user-center-api-keys`
**Created**: 2026-06-18
**Status**: Implemented
**Input**: User description: "通过开源框架 next-openapi-gen 支持在线 api-docs 文档与 OpenAPI 接口元数据。建立用户中心，提供用户配置（昵称、邮箱修改）、密码重置、显示偏好（风格、语言）、个人 API 密钥生成及删除。API Key 需预置 Scope 控制（查看、创建、编辑、删除、分享、运行页面权限），Scope 不可变更，只能生成新 Key，暂不需要有效期控制。所有通过 Key 的 API 访问需有独立审计记录，用户可在用户中心查看自己的 Key 调用记录，系统管理员可在系统配置页面查看及查询所有 API 访问记录（包括报错）。所有新页面遵循现有 Style 及多语言支持。"

## Implementation Notes

- `getActorUserId()` was added to `apps/web/src/server/permissions/index.ts` so services that rely on a numeric `userId` (e.g., page authorship checks) treat API-key actors as authenticated users, while account-management routes remain session-only.
- `api_keys.user_id` and `api_audit_entries.{key_id,user_id}` foreign keys use `ON DELETE CASCADE` so existing test/user cleanup does not fail because of leftover audit rows.
- The Scalar OpenAPI viewer is loaded through a client-only dynamic import in `apps/web/src/components/api-docs/ApiDocsViewer.tsx` because Next.js 16 does not allow `ssr: false` on the page file itself.
- The Docker build now passes `API_KEY_ENCRYPTION_KEY` as a build arg to the builder stage and reuses the `deps` stage `node_modules` in the runner stage to avoid a second, failure-prone network install.
- The migration script was moved from `docker/migrate.mjs` to `apps/web/scripts/migrate.mjs` so it resolves dependencies from the web workspace `node_modules` at runtime.
- Playwright E2E for `/api-docs` validates the generated spec and viewer load; it does not drive Scalar's interactive "Try it" UI because the rendered DOM is not reliably targetable across viewer versions.
- One pre-existing E2E test (`e2e/flows.spec.ts` publish-workflow) times out independently of this feature and is not part of the 002 acceptance criteria.

## Clarifications

### Session 2026-06-18

- Q: Scope vs role interaction — does an API key bypass the owner's role? → A: No. Effective permission for a key-authenticated request is the **intersection** of the key's scope and the owner's role permissions. A reader holding a key with the `create` scope still cannot create pages, because the role denies it. Conversely, an editor holding a key with only the `view` scope can only read via that key, even though their role permits editing. This is the most secure interpretation and satisfies constitution P4 (every API route checks permissions).
- Q: "Share" and "Run" scopes — what endpoints do they protect today? → A: These scopes are **forward-looking reservations** in the scope enum. No existing wiki endpoint maps to share or run yet. The scope values exist so keys can be provisioned with future-proof permissions; enforcement activates when the corresponding features (page sharing, embedded code execution) land. For this slice, a key carrying only `share`/`run` scopes has no effect on existing endpoints.
- Q: Email change flow — verification email? → A: Immediate. The system validates format and uniqueness but does not send a confirmation email, consistent with 001's single-service / no-email-service constraint (A4). The change takes effect on next sign-in.
- Q: Email change — require current password re-auth? → A: **No.** Being signed in is sufficient to change the email. The system validates format and uniqueness only; no current-password gate is imposed. This keeps the email-change flow frictionless and is consistent with the "immediate" decision above. The trade-off (a hijacked session can change email then password) is accepted for this personal/small-team wiki scale.
- Q: OpenAPI docs visibility — public or authenticated? → A: Public by default (consistent with P8 Open Standards — the API contract should be discoverable). An admin may restrict docs to authenticated users via a future setting; for this slice they are open.
- Q: Theme/language preference storage — server-side or client-side? → A: **Server-side** on the user record. Preferences persist across browsers and devices; the User Center is the canonical source of truth. Client-side `localStorage` remains as a fast-init fallback only (to prevent theme flash on load). Requires two new columns on the users table (`theme_preference`, `locale_preference`).
- Q: API key storage — hashed (one-time view) or encrypted (revisitable)? → A: **Encrypted at rest (reversible).** Keys are stored encrypted so users can reveal the full key value from the key list at any time, prioritizing ease of use for a personal/team wiki. A non-secret visible prefix (e.g. `nwk_abc123…`) is also stored for quick visual identification without revealing the full secret. This replaces the earlier hash-only / one-time-view approach.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage Own Profile & Display Preferences (Priority: P1)

As a signed-in user, I want a single "User Center" where I can update my
nickname, change my email, change my password, and adjust my display preferences
(theme and language), so that I control my own identity and experience without
needing an admin.

**Why this priority**: Self-service identity management is the foundation of the
user center. It is independently valuable: users gain control over their account
and preferences the moment it ships, reducing admin overhead and improving the
personal experience. It also establishes the user-center UI shell that the
remaining stories build upon.

**Independent Test**: Sign in as any user, open the User Center, change the
nickname, change the password (providing the current one), switch the theme and
language, and confirm all changes persist across page refresh and re-login.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they open the User Center and update
   their nickname, **Then** the new nickname appears in the header, page
   footers, and author displays immediately and after refresh.
2. **Given** a signed-in user, **When** they change their email to one not
   already in use, **Then** the change is saved and they can sign in with the
   new email on next login.
3. **Given** a signed-in user, **When** they change their email to one already
   registered by another account, **Then** the change is rejected with a clear
   error and no duplicate is created.
4. **Given** a signed-in user, **When** they provide their current password
   correctly and a valid new password, **Then** the password is updated and they
   can sign in with the new password.
5. **Given** a signed-in user, **When** they provide an incorrect current
   password, **Then** the password change is rejected with a clear error.
6. **Given** a signed-in user, **When** they select a theme (light / dark / auto)
   and a language (English / Chinese) in the User Center, **Then** the
   preference is saved and applied consistently across all pages on this and
   future sessions.

---

### User Story 2 - Explore API Documentation Online (Priority: P2)

As a developer or integrator, I want to browse interactive API documentation
online (generated from the live route definitions), so that I can discover
available endpoints, understand request/response schemas, and try calls directly
from the browser before writing integration code.

**Why this priority**: Documentation is the gateway to programmatic access
(US3). Without discoverable docs, external consumers cannot use the API keys
meaningfully. It also fulfills constitution P8 (public REST + OpenAPI
documentation) which was scoped out of 001.

**Independent Test**: Open the API docs URL in a browser (no login required);
see a categorized list of all REST endpoints with their methods, parameters,
request bodies, response schemas, and authentication requirements; execute a
sample GET request inline and see the live response.

**Acceptance Scenarios**:

1. **Given** the wiki is running, **When** a visitor opens the API docs URL,
   **Then** they see an interactive documentation page listing every REST
   endpoint with method, path, parameters, and response schema.
2. **Given** the docs page, **When** the visitor expands an endpoint, **Then**
   they see the request/response shapes derived from the same shared schemas
   the application uses internally (no drift).
3. **Given** the docs page, **When** the visitor executes a read endpoint
   inline, **Then** they receive the live response from the server.
4. **Given** a new REST endpoint is added to the application, **When** the docs
   are regenerated, **Then** the new endpoint appears automatically without
   manual documentation edits.

---

### User Story 3 - Generate API Keys & Access the API Programmatically (Priority: P2)

As a user who wants programmatic access to the wiki, I want to generate personal
API keys with predefined scopes, use them to authenticate REST API calls, and
revoke keys when no longer needed, so that scripts and integrations can access
the wiki on my behalf within a bounded permission set.

**Why this priority**: API keys are the core of the external access story. They
depend on US2 (docs) for discoverability and on US1 (user center) for the
management UI. Together US2+US3 unlock the wiki as a platform.

**Independent Test**: Sign in, open User Center → API Keys, generate a key named
"my-bot" with the `view` scope, copy the revealed key value, call
`GET /api/pages` with `Authorization: Bearer <key>`, and receive the published
page list. Then try `DELETE /api/pages/{path}` with the same key and receive a
403 (scope denies it). Delete the key and confirm subsequent calls return 401.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they create a new API key with a name
   and a selected set of scopes, **Then** the key value is displayed at creation
   and the key is saved with the chosen (immutable) scopes. The user can later
   reveal the key value from the key list.
2. **Given** an API key with the `view` scope owned by an editor, **When** a
   client calls `GET /api/pages` with the key as a Bearer token, **Then** the
   request succeeds and returns the published page list.
3. **Given** the same key (scope `view`), **When** the client calls
   `POST /api/pages` (create), **Then** the request is denied with 403 because
   the scope does not include `create`.
4. **Given** an API key with the `create` scope owned by a **reader**, **When**
   the client calls `POST /api/pages`, **Then** the request is denied with 403
   because the owner's role does not permit creation (scope ∩ role = ∅).
5. **Given** a revoked (deleted) key, **When** the client calls any endpoint,
   **Then** the request is denied with 401.
6. **Given** the user already created a key, **When** they try to change the
   scope of that key, **Then** no such operation is offered; they must generate
   a new key instead.

---

### User Story 4 - View Own API Key Audit Log (Priority: P3)

As a key owner, I want to see a history of API calls made with my keys, so that
I can verify expected usage, spot unexpected activity, and confirm whether a key
has been compromised.

**Why this priority**: Transparency builds trust in programmatic access. It
depends on US3 (keys exist and produce calls). It is independently valuable for
security-conscious users.

**Independent Test**: Sign in, make several API calls with one of your keys
(including at least one that errors), open User Center → API Audit, and see
those calls listed with endpoint, status, timestamp, and key name.

**Acceptance Scenarios**:

1. **Given** the user owns keys that have made API calls, **When** they open the
   audit section of the User Center, **Then** they see a chronological list of
   calls made by their keys including method, path, status code, duration, and
   timestamp.
2. **Given** a call that returned an error (4xx or 5xx), **When** the user views
   the audit log, **Then** that call appears with its error status and a
   short error message.
3. **Given** another user's key activity exists, **When** the user views their
   own audit log, **Then** they do NOT see any entries belonging to other users
   (no cross-user leak).
4. **Given** the audit log, **When** the user filters by key name or status,
   **Then** only matching entries are shown.

---

### User Story 5 - Admin Queries All API Audit Logs (Priority: P3)

As an admin, I want a dedicated admin page under system configuration where I
can view and query all API access records across every user and key (including
errors), so that I can investigate incidents, audit compliance, and monitor
integration health.

**Why this priority**: Centralized audit is an operational necessity for any
system exposing programmatic access. It depends on US3 (calls exist) and is the
admin counterpart to US4.

**Independent Test**: Sign in as admin, open Admin → API Audit, and see all
recent API calls across all users; filter by a specific user, a specific key,
an error status, and a time range; confirm each filter narrows the results
correctly.

**Acceptance Scenarios**:

1. **Given** API calls have been made by multiple users' keys, **When** the
   admin opens the global API audit page, **Then** they see a unified,
   chronological list of all calls with user, key name, method, path, status,
   duration, and timestamp.
2. **Given** the audit page, **When** the admin filters by a specific user,
   **Then** only that user's key calls are shown.
3. **Given** the audit page, **When** the admin filters by status "error"
   (4xx/5xx), **Then** only failed calls are shown, each with its error
   message.
4. **Given** the audit page, **When** the admin filters by a time range,
   **Then** only calls within that range are shown.
5. **Given** a non-admin user, **When** they attempt to open the admin audit
   page by URL, **Then** they are denied without confirming the page exists
   (not-found or forbidden per the existing pattern).

---

### Edge Cases

- A user generates a key but does not select any scope → rejected; at least one
  scope is required.
- A user generates a very large number of keys → a reasonable per-user maximum
  is enforced (prevents abuse); exceeding it shows a clear error.
- A user wants to see a previously created key value → they can reveal it from
  the key list at any time (the key is stored encrypted, not hashed). The reveal
  action requires an explicit click to prevent casual exposure.
- A user's account is disabled by an admin while one of their keys is in active
  use → subsequent calls with that key are rejected immediately (disabled users
  cannot authenticate, even via key).
- A user changes their email → existing API keys remain valid (key ownership is
  tied to the user account, not the email string).
- An API request arrives with a malformed or truncated Bearer token → returns
  401; the attempt is logged in the audit trail with an "unauthenticated" marker
  and no user attribution (no key/user resolved).
- An API request arrives with a Bearer token that does not match any key →
  returns 401; logged as an error event.
- Concurrent revocation and request: a request in flight when the key is revoked
  may complete, but the next request is rejected (eventual consistency within
  one request boundary).
- Audit log storage growth: the log is append-only; for this slice no automatic
  pruning is enforced (personal/small-team scale). A retention policy may be
  added later.
- OpenAPI docs are accessed while the server is mid-deploy → the docs reflect
  the currently running route set; no stale cache beyond the process lifetime.

## Requirements *(mandatory)*

### Functional Requirements

#### User Center & Profile

- **FR-001**: System MUST provide a "User Center" area reachable from the
  header, where a signed-in user manages their profile, password, display
  preferences, API keys, and personal audit log.
- **FR-002**: System MUST let the user update their display name (nickname); the
  change MUST be reflected immediately across all surfaces that show the author
  name.
- **FR-003**: System MUST let the user change their email address, validating
  format and uniqueness. The change is immediate (no confirmation email, no
  current-password re-authentication). The user can sign in with the new email
  on the next login.
- **FR-004**: System MUST let the user change their own password by providing
  the current password and a new password. An incorrect current password MUST be
  rejected with a clear error.
- **FR-005**: System MUST consolidate display preferences (theme: light / dark /
  auto; language: English / Chinese) inside the User Center. Preferences MUST be
  stored server-side on the user record so they persist across browsers,
  devices, and sessions. Client-side storage is used only as a fast-init
  fallback to prevent theme flash on page load.

#### API Keys

- **FR-006**: System MUST let a signed-in user generate personal API keys from
  the User Center. Each key has a user-supplied label (name) and a selected set
  of scopes chosen at creation.
- **FR-007**: System MUST define the following predefined page-permission scopes:
  `view` (查看), `create` (创建), `edit` (编辑), `delete` (删除), `share` (分享),
  `run` (运行). Additional scopes MAY be added in future slices without
  migration.
- **FR-008**: Key scopes MUST be immutable after creation. To change the
  permission set, the user generates a new key and revokes the old one. No
  in-place scope editing is exposed.
- **FR-009**: System MUST store the key secret encrypted (reversible) so that
  users can reveal the full key value from the key list at any time. The reveal
  action MUST require an explicit user interaction (e.g., a "show" button) to
  prevent casual shoulder-surfing. The key list MUST also display a non-secret
  visible prefix (e.g. `nwk_abc123…`) for quick identification without
  revealing the full secret.
- **FR-010**: System MUST encrypt key secrets at rest using a server-managed
  encryption key. The encryption MUST be reversible so the full key can be
  revealed on user demand, but a database compromise alone MUST NOT expose
  usable plaintext keys without the encryption key.
- **FR-011**: System MUST let the user delete (revoke) a key at any time. A
  revoked key MUST be rejected on all subsequent API requests within the next
  request.
- **FR-012**: API key authentication MUST use the standard HTTP `Authorization:
  Bearer <key>` header. Requests with a valid key authenticate as the key's
  owner.
- **FR-013**: The effective permission for a key-authenticated request MUST be
  the intersection of (the key's scopes) and (the owner's role-based
  permissions). A key scope never grants an operation the owner's role denies.
- **FR-014**: Keys MUST NOT have a built-in expiration for this slice. A key
  remains valid until explicitly revoked by its owner or an admin.
- **FR-015**: System MUST enforce a reasonable maximum number of active keys per
  user to prevent abuse.

#### OpenAPI Documentation

- **FR-016**: System MUST auto-generate an OpenAPI specification from the live
  REST route definitions and shared schemas, so that the documentation never
  drifts from the implementation.
- **FR-017**: System MUST serve interactive API documentation at a real,
  bookmarkable URL. The docs MUST list every REST endpoint with method, path,
  parameters, request body schema, response schema, and authentication
  requirement.
- **FR-018**: The documentation MUST be publicly readable by default (no login
  required), consistent with the open API contract.
- **FR-019**: The documentation MUST allow a visitor to execute read endpoints
  inline and observe the live response.

#### API Audit Logging

- **FR-020**: System MUST record an audit entry for every API request
  authenticated by an API key. The entry MUST capture: key id, owner user,
  HTTP method, path, response status code, duration, timestamp, and (on error)
  a short error message.
- **FR-021**: System MUST record failed authentication attempts (invalid /
  revoked / malformed key) as audit entries with an "unauthenticated" marker and
  no user attribution when the key/user cannot be resolved.
- **FR-022**: System MUST let a user view the audit log of their own keys in the
  User Center, filterable by key and status. The user MUST NOT see any other
  user's entries.
- **FR-023**: System MUST provide an admin page (under system configuration)
  where an admin can view and query ALL API audit entries across all users,
  filterable by user, key, endpoint, status, and time range. Non-admins MUST be
  denied access without confirming the page exists.

#### Cross-Cutting

- **FR-024**: Every new page introduced by this feature (User Center sections,
  API docs, admin audit) MUST follow the existing unified design system and
  support both English and Chinese via the established i18n framework.
- **FR-025**: Every new route MUST be a real, bookmarkable URL with working
  browser back/forward/refresh/deep-link/open-in-new-tab, consistent with
  constitution P10 and the existing no-SPA navigation contract.
- **FR-026**: API key authentication MUST be enforced through the existing
  permission chokepoint (`can()`); no API route bypasses the permission check
  regardless of whether the caller authenticates via session cookie or API key.

### Key Entities *(include if feature involves data)*

- **API Key**: a personal credential issued to a user for programmatic API
  access. Has a user-given label (name), an immutable set of scopes chosen at
  creation, an encrypted secret (revisitable via a reveal action in the key
  list), a non-secret visible prefix for quick identification, a creation
  timestamp, and a revocation timestamp (null while active). Belongs to exactly
  one user. Scopes are drawn from a predefined enum (`view`, `create`, `edit`,
  `delete`, `share`, `run`).
- **API Audit Entry**: an immutable record of a single API request made with an
  API key. Captures the key, the owning user, the HTTP method and path, the
  response status code, the request duration, a timestamp, and a short error
  message on failure. Failed authentication attempts are recorded with a null
  user/key when unresolved. Append-only; no update or delete by normal
  operations.
- **User Profile (extended)**: the existing user account gains self-managed
  fields already present in the schema (`display_name`, `email`) plus display
  preferences (theme, language) stored server-side as new columns
  (`theme_preference`, `locale_preference`). The User Center is the canonical
  place to edit these; client-side storage serves only as a fast-init fallback.
  No change to the role or status model.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in user can update their nickname, email, and password
  from the User Center in under 1 minute per operation.
- **SC-002**: A signed-in user can set or change their theme and language
  preference in the User Center and see the choice persist across logout,
  re-login, and a different browser.
- **SC-003**: A developer with no prior knowledge of the codebase can discover
  all available API endpoints, their parameters, and their response schemas
  solely from the online API docs, without reading source code.
- **SC-004**: A user can generate an API key and complete a successful
  authenticated API call within 2 minutes of first opening the User Center.
- **SC-005**: A revoked API key is rejected on the very next request (no grace
  window beyond the in-flight request).
- **SC-006**: Every API call made with a key — whether it succeeds (2xx) or
  fails (4xx/5xx) — appears in the audit log within seconds, visible to the key
  owner and to admins.
- **SC-007**: An admin can locate any specific API access event by filtering on
  user, key, status, or time range and retrieve it in under 10 seconds on a
  small-team dataset.
- **SC-008**: A key whose scope exceeds the owner's role permissions cannot
  perform the disallowed operation, verified by a direct API call returning 403.
- **SC-009**: Every new page ships in both English and Chinese, with no
  hardcoded user-facing strings, consistent with the existing i18n convention.

## Assumptions

These reasonable defaults were inferred from the description and project
context; they can be revised via `/speckit.clarify` before planning.

- **A1 — Scope ∩ role permission model** (confirmed). Effective permission for a
  key-authenticated request is the intersection of the key's scopes and the
  owner's role-based permissions. This is the most secure interpretation and
  satisfies constitution P4. See FR-013.
- **A2 — "Share" and "Run" scopes are forward-looking reservations**. No
  existing wiki endpoint maps to share or run. The scope values exist in the
  enum so keys can be provisioned with future-proof permissions; enforcement
  activates when the corresponding features (page sharing, embedded code
  execution) land. For this slice a key carrying only `share`/`run` has no effect
  on existing endpoints. See FR-007.
- **A3 — Email change is immediate (no verification email, no password
  re-auth)**. Consistent with 001's single-service / no-email-service
  constraint (A4) and the user's explicit decision to keep the flow
  frictionless. The system validates format and uniqueness but does not send a
  confirmation email and does not require the current password. See FR-003.
- **A4 — API key secrets are encrypted (reversible) at rest**. The raw key
  value is stored encrypted using a server-managed key so it can be revealed on
  user demand from the key list. A non-secret visible prefix is stored alongside
  for quick identification. A database compromise alone does not expose usable
  plaintext without the encryption key. See FR-009, FR-010.
- **A5 — No key expiration for this slice**. Keys are valid until revoked. A
  TTL/expiration feature may be added later without migration (an `expires_at`
  column is trivially added). See FR-014.
- **A6 — OpenAPI docs are public by default**. The API contract is discoverable
  without authentication, consistent with P8. An admin-restricted mode may be
  added later. See FR-018.
- **A7 — Audit log is append-only with no automatic pruning for this slice**.
  Personal/small-team scale makes indefinite retention acceptable in a single
  PostgreSQL database. A retention policy may be added later. See Edge Cases.
- **A8 — API key format follows a recognizable prefix convention**. Keys use a
  human-recognizable prefix (e.g. `nwk_`) followed by a random opaque token of
  sufficient entropy. This is an implementation detail finalized in planning.
- **A9 — next-openapi-gen is the generation framework**. The user explicitly
  requested `https://github.com/tazo90/next-openapi-gen`. The spec remains
  technology-agnostic (FR-016/017 speak of auto-generation), but the plan will
  adopt this framework per the user's direction.
- **A10 — Failed-auth audit entries record what is resolvable**. When a Bearer
  token cannot be matched to a key, the audit entry records the attempt with
  null user/key and the error reason. When the key is resolved but revoked, the
  entry records the resolved user/key and the revocation reason. See FR-021.
- **A11 — Display preferences are consolidated, not duplicated**. The User
  Center becomes the canonical place to set theme and language. The existing
  header toggles remain as quick shortcuts that write to the same underlying
  preference. See FR-005.
