# Implementation Plan: User Center & API Keys

**Branch**: `002-user-center-api-keys` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-user-center-api-keys/spec.md`

## Summary

Add a User Center for self-service profile management (nickname, email, password,
display preferences), personal API key generation with scoped permissions, online
OpenAPI documentation, and API audit logging — turning the wiki into a platform
with programmatic access.

This slice builds entirely on the 001 foundation: same Drizzle/PostgreSQL stack,
same `can()` permission chokepoint, same Mantine + Tailwind design system, same
i18n framework, same REST + Zod API pattern. No new runtime services; one new
env var (`API_KEY_ENCRYPTION_KEY`). All new tables and columns are added via
idempotent Drizzle migrations that auto-apply on container restart.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.9+ (Next.js 16 runtime floor).
**Primary Dependencies (inherited from 001)**: Next.js 16 (App Router, RSC) +
React 19.2; Drizzle ORM (PostgreSQL); custom bcrypt session auth (DB-backed
sessions); unified/remark/rehype (Markdown pipeline); Mantine + Tailwind CSS;
TanStack Query; Zustand; React Hook Form; Zod. **i18n**: custom framework
(`apps/web/src/i18n/`) with `en.ts` (canonical) + `zh.ts`. **Theme**: client-side
light/dark/auto with `localStorage` — this slice adds server-side persistence.
**New Dependencies (this slice)**: `next-openapi-gen` (OpenAPI spec generation
from Next.js route definitions + Zod schemas); Node built-in `crypto` (AES-256-GCM
key encryption — no new dep). **Storage**: PostgreSQL 16+ (single database; new
`api_keys` + `api_audit_logs` tables + `users` column additions). **Testing**:
Vitest (unit/integration) + Playwright (E2E). **Constraints**: Single Node
service + single PostgreSQL database only; no Redis, email, or external services;
no SPA (server-rendered pages, real URLs). **Scale/Scope**: Single instance;
personal/small-team wiki. API keys per user capped at a reasonable maximum.

## Constitution Check

*GATE: Must pass before implementation. Re-check after design.*

Source: `.specify/memory/constitution.md` v1.3.0.

| Principle / Mandate | Status | How this slice satisfies it |
|---|---|---|
| P1 Simple Deployment | PASS | No new services. One new env var (`API_KEY_ENCRYPTION_KEY`) added to `docker-compose.yml`. New migrations auto-apply on container restart via existing `start.mjs` hook. `next-openapi-gen` is a dev dependency that generates the spec at build time. |
| P2 AI Optional Enhancement | PASS (N/A) | No AI in this slice. |
| P3 Rendering Pipeline is Sacred | PASS (N/A) | No content rendering changes. This slice touches auth, API, and UI surfaces only. |
| P4 Permissions are First-Class | PASS | API key authentication flows through the same `can()` chokepoint. The Actor type is extended with an `api_key` variant carrying scopes; `can()` enforces scope ∩ role for key-authenticated requests (spec A1). No route bypasses the permission check regardless of auth method. |
| P5 Style System & UI Consistency | PASS | All new UI (User Center, API docs, admin audit) built on the existing unified design system (`src/components/ui/`). No per-page bespoke styling. |
| P6 Async-First for Heavy Operations | PASS (N/A) | No operation exceeds the 500ms threshold. Audit logging is a single INSERT (fire-and-forget after response). Key generation is sub-ms. |
| P7 Version Everything | PASS (N/A) | No content versioning changes. API keys and audit entries are new entities, not versioned content. |
| P8 Open Standards Over Proprietary | PASS | OpenAPI 3.1 spec auto-generated from route definitions + shared Zod schemas, served at a public URL. API key auth uses standard `Authorization: Bearer` header. REST + JSON throughout. This slice fulfills the P8 obligation that 001 scoped out. |
| P9 Explicit Over Implicit | PASS | New services (`api-keys`, `audit`, `user-center`) are explicitly registered. OpenAPI spec is generated from explicit route metadata, not filesystem scanning. Encryption key is explicitly configured via env. |
| P10 Operator Experience is Product Surface | PASS | Migrations are idempotent and auto-apply. `API_KEY_ENCRYPTION_KEY` is validated at boot (Zod). Missing key in production = fail-fast. Dev default for local convenience. |
| P11 Focused Scope | PASS | Slice is scoped to user center, API keys, docs, and audit. No key expiration, no email verification, no key rotation, no audit retention policy. Deferred items are explicit non-goals. |
| P12 Native Web Navigation | PASS | User Center sections are real URLs (`/user-center/profile`, `/user-center/api-keys`, etc.). API docs at `/api-docs`. Admin audit at `/admin/api-audit`. Browser back/forward/refresh/deep-link work everywhere. Not an SPA. |
| Mandate: Permission Model | PASS | Extended, not replaced. The `can()` chokepoint gains an `api_key` actor variant. Scope ∩ role is enforced inside `can()`. No hardcoded admin bypass. `manage_users` is never allowed via API key (no scope maps to it). |
| Mandate: Multi-language | PASS | All new UI strings added to both `en.ts` and `zh.ts`. TypeScript enforces bilingual completeness (`Translations = typeof en`). |
| Mandate: Deployment & Ops | PASS | Docker Compose unchanged except one new env var. Migrations auto-apply. No new containers. |
| Mandate: Frontend Routing & URL | PASS | New URLs follow RESTful conventions. User Center at `/user-center/*`, API docs at `/api-docs`, admin audit at `/admin/api-audit`. Breadcrumbs derived from route. |
| Mandate: Frontend Data Flow | PASS | RSC for server data with permission context. Client mutations via TanStack Query (same pattern as 001). API key management is client-side form + API calls. |

No gate failures. The slice extends existing architectural machinery rather than
introducing new paradigms.

## Design Decisions

### D1 — Unified Actor Resolution

**Problem**: The current `getCurrentActor()` only reads session cookies. API key
auth needs to inspect the `Authorization: Bearer` header and resolve the key's
owner.

**Decision**: Create a unified `resolveActor()` function that checks (in order):
1. Bearer header → resolve API key → return `{ kind: 'api_key', userId, role,
   scopes, keyId }` (role read fresh from DB, same D8 principle as sessions).
2. Session cookie → existing flow → return `{ kind: 'user', userId, role }`.
3. Neither → `{ kind: 'anonymous' }`.

`createApiContext()` calls `resolveActor()` instead of `getCurrentActor()`. The
returned context carries optional `apiKeyInfo` (keyId, userId) and `authError`
(for audit logging of failed auth). Existing route handlers continue calling
`createApiContext()` — no signature change.

**Accessing headers**: `headers()` from `next/headers` is available in route
handlers and returns the `Authorization` header. This is the same mechanism
used to read cookies today.

### D2 — Scope ∩ Role in `can()`

**Problem**: API key scopes must be intersected with the owner's role permissions.
A key with `create` scope owned by a reader must not create pages.

**Decision**: Extend the `Actor` discriminated union with an `api_key` variant
carrying `scopes`. Inside `can()`:

1. If actor is `api_key`: check if the requested action maps to a scope in the
   key's scope set. If not → deny. If yes → fall through to the normal role-based
   check (same logic as `user` actor, including authorship).
2. If actor is `user` or `anonymous`: existing logic unchanged.

**Scope-to-action mapping**:

| Scope | Maps to Actions |
|---|---|
| `view` | `read`, `read_draft` |
| `create` | `create` |
| `edit` | `edit`, `publish` |
| `delete` | `delete` |
| `share` | *(no existing action — forward-looking)* |
| `run` | *(no existing action — forward-looking)* |

`manage_users` has no scope mapping — it is never allowed via API key.

This naturally implements scope ∩ role: a `create` scope on a reader-key passes
step 1 (scope allows) but fails step 2 (role denies `create` for readers).

### D3 — Key Format & Encrypted Storage

**Problem**: Keys must be stored encrypted (reversible) so users can reveal them
later, but a DB compromise alone must not expose plaintext.

**Decision**:
- **Key format**: `nwk_` prefix + base64url(32 random bytes) ≈ 48 chars total.
  The `nwk_` prefix makes keys visually identifiable in logs and configs.
- **Visible prefix**: first 12 chars (e.g. `nwk_aB3xY9zK`). Stored in plaintext
  as `key_prefix` for fast indexed lookup and quick visual identification.
- **Encrypted secret**: full key value encrypted with AES-256-GCM using
  `API_KEY_ENCRYPTION_KEY` from env. Stored as `key_secret_encrypted` (text,
  includes nonce + tag). Node built-in `crypto` module — no new dependency.
- **Lookup flow**: extract first 12 chars from incoming Bearer token →
  `SELECT WHERE key_prefix = $1 AND revoked_at IS NULL` → decrypt stored secret
  → constant-time compare with incoming token. Indexed prefix lookup avoids
  full-table scan.
- **Reveal flow**: user clicks "show" → `SELECT key_secret_encrypted` → decrypt
  → return plaintext to the UI.

**Encryption details**: AES-256-GCM with a random 12-byte nonce per encryption.
The encrypted blob is `base64(nonce || ciphertext || tag)`. The encryption key
is a 32-byte hex string (64 chars) from `API_KEY_ENCRYPTION_KEY`. Key rotation
is not in scope; the scheme supports future rotation via re-encryption of all
keys.

### D4 — Audit Logging via Route Wrapper

**Problem**: Every API-key-authenticated request must be audited, including
failed auth. Inline audit calls in every route handler are error-prone.

**Decision**: A `withApiAudit()` higher-order function wraps route handler
exports. The wrapper:

1. Records start time and extracts Bearer header.
2. Calls the original handler (which internally calls `createApiContext()`).
3. Captures the response status code.
4. If a Bearer header was present (valid or invalid): inserts an audit entry
   with `{ key_id, user_id, method, path, status_code, duration, timestamp,
   error_message }`. For failed auth, `key_id`/`user_id` are null and
   `error_message` records the reason.
5. Returns the response unchanged.

**Wrapped routes**: All `/api/**` routes except `/api/auth/**` (session-only)
and `/api/preview` (no auth). The wrapper is applied as a one-line change per
route export:
```ts
export const GET = withApiAudit(originalGetHandler);
```

**Audit entry shape**: matches FR-020/FR-021. The insert is fire-and-forget
(awaited but non-blocking to the response — the response is already constructed
before the insert runs). For a small-team wiki, the latency of one INSERT is
negligible.

### D5 — OpenAPI Generation via next-openapi-gen

**Problem**: The OpenAPI spec must be auto-generated from live route definitions
so it never drifts from the implementation.

**Decision**: Use `next-openapi-gen` (user's explicit choice, spec A9). It reads
Next.js App Router route files and Zod schemas to produce an OpenAPI 3.1
document. The spec is generated at build time and served at `/api/openapi.json`.
Interactive docs (Scalar or Swagger UI) are served at `/api-docs` — a real,
bookmarkable URL. The docs page is public (no login required, FR-018) and allows
inline execution of read endpoints (FR-019).

**Integration**: Route files declare their OpenAPI metadata (summary,
parameters, request/response schemas) via `next-openapi-gen`'s API. Shared Zod
schemas in `packages/shared` are reused for both validation and documentation —
no drift. The `openapi.json` route handler serves the generated spec; the
`/api-docs` page renders it with an interactive viewer.

### D6 — Server-Side Preference Sync

**Problem**: Theme and language preferences must persist across browsers and
devices (SC-002). Currently they are client-side `localStorage` only.

**Decision**:
- Add `theme_preference` (text, nullable) and `locale_preference` (text,
  nullable) columns to `users` via migration.
- Root `layout.tsx` (RSC) reads the signed-in user's preferences from DB and
  passes them as initial values to `ThemeProvider` and `I18nProvider`.
- Client-side `localStorage` remains as a fast-init fallback (prevents theme
  flash on first paint before React hydrates).
- The User Center Preferences tab writes to the DB via `PATCH /api/user/
  preferences`. The header `ThemeToggle` and `LanguageSwitcher` also write to
  the DB (in addition to localStorage) when the user is signed in.
- Anonymous users continue to use localStorage only.

**Flash prevention**: The root layout renders an inline `<script>` that reads
`localStorage` and applies the theme class before React hydration — same
technique used by most SSR frameworks. The server-side preference overrides
localStorage on full page loads (SSR), but localStorage wins on client-side
navigation (instant) and is synced back to the server on the next preference
write.

### D7 — User Center UI Structure

**Problem**: The User Center needs to host multiple sections (profile,
preferences, API keys, audit) without becoming a monolithic page.

**Decision**: The User Center is a route group at `/user-center` with
sub-routes for each section:
- `/user-center` — redirect to `/user-center/profile`
- `/user-center/profile` — nickname, email, password
- `/user-center/preferences` — theme, language
- `/user-center/api-keys` — key list, create, reveal, revoke
- `/user-center/audit` — personal API audit log

Each section is a server-rendered page using the existing `<Layout>` component.
Client islands handle form submissions and interactive tables. A sidebar or
tab navigation within the User Center provides section switching — all real URLs
with working browser history.

Admin audit is a separate page at `/admin/api-audit` (under the existing admin
route group), visible only to admins via the navigator sidebar.

API docs live at `/api-docs` — a standalone page outside the User Center (public,
no login required).

### D8 — Encryption Key Management

**Problem**: API key encryption requires a server-managed key that must not be
in the DB (a DB compromise must not expose keys, spec FR-010).

**Decision**: `API_KEY_ENCRYPTION_KEY` is a 32-byte hex string (64 chars) loaded
from env. In production: required — Zod validation fails fast if missing. In
development: defaults to a well-known dev key (hardcoded in config.ts, clearly
marked as dev-only). Added to `docker-compose.yml` env block. Key rotation is
not in scope but the AES-256-GCM scheme with per-key nonce supports future
rotation via a re-encryption migration script.

## Project Structure

### Documentation (this feature)

```text
specs/002-user-center-api-keys/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
├── data-model.md        # Schema increments (new tables + columns)
├── contracts/
│   ├── rest-api.md      # New REST API endpoints
│   └── urls.md          # New URL / navigation contract
├── checklists/
│   └── requirements.md  # Requirements checklist (complete)
└── tasks.md             # Task breakdown
```

### Source Code (new + modified)

```text
apps/web/
├── app/
│   ├── (user)/                          # NEW route group
│   │   └── user-center/
│   │       ├── page.tsx                 # Redirect to /user-center/profile
│   │       ├── layout.tsx               # User Center shell + nav
│   │       ├── profile/page.tsx         # Nickname, email, password
│   │       ├── preferences/page.tsx     # Theme, language
│   │       ├── api-keys/page.tsx        # Key list + create + reveal + revoke
│   │       └── audit/page.tsx           # Personal audit log
│   ├── (admin)/admin/
│   │   └── api-audit/page.tsx           # NEW admin audit page
│   ├── api-docs/
│   │   └── page.tsx                     # NEW OpenAPI docs (public)
│   └── api/
│       ├── user/                        # NEW user management API
│       │   ├── profile/route.ts         # PATCH nickname
│       │   ├── email/route.ts          # PATCH email
│       │   ├── password/route.ts       # POST change password
│       │   └── preferences/route.ts    # PATCH theme + locale
│       ├── api-keys/                    # NEW API key management
│       │   ├── route.ts                # GET list, POST create
│       │   └── [id]/
│       │       └── route.ts            # DELETE revoke, GET reveal
│       ├── audit/                       # NEW audit log API
│       │   ├── route.ts                # GET own audit (paginated)
│       │   └── all/route.ts            # GET all audit (admin, paginated)
│       └── openapi.json/route.ts       # Serve generated OpenAPI spec
├── src/
│   ├── server/
│   │   ├── db/schema/
│   │   │   ├── enums.ts                # MODIFIED: add apiKeyScopeEnum
│   │   │   └── index.ts                # MODIFIED: add api_keys, api_audit_logs, users cols
│   │   ├── services/
│   │   │   ├── api-keys.ts             # NEW: CRUD + encrypt/decrypt + lookup
│   │   │   ├── audit.ts                # NEW: write + query audit entries
│   │   │   ├── user-center.ts          # NEW: profile, email, password, prefs
│   │   │   └── auth.ts                 # MODIFIED: add resolveActor() with Bearer
│   │   ├── permissions/index.ts        # MODIFIED: extend Actor + can() for api_key
│   │   ├── api/
│   │   │   ├── session.ts              # MODIFIED: createApiContext uses resolveActor
│   │   │   ├── audit-wrapper.ts        # NEW: withApiAudit HOF
│   │   │   └── openapi.ts              # NEW: next-openapi-gen integration
│   │   ├── crypto/
│   │   │   └── key-encryption.ts       # NEW: AES-256-GCM encrypt/decrypt
│   │   └── config.ts                   # MODIFIED: add API_KEY_ENCRYPTION_KEY
│   ├── components/
│   │   ├── user-center/                # NEW UI components
│   │   │   ├── ProfileForm.tsx
│   │   │   ├── PreferencesForm.tsx
│   │   │   ├── ApiKeyList.tsx
│   │   │   ├── ApiKeyCreateDialog.tsx
│   │   │   ├── ApiKeyReveal.tsx
│   │   │   └── AuditLogTable.tsx
│   │   ├── layout/
│   │   │   ├── Header.tsx              # MODIFIED: add User Center link
│   │   │   └── Navigator.tsx          # MODIFIED: add admin audit nav entry
│   │   └── api-docs/
│   │       └── ApiDocsViewer.tsx       # NEW: interactive docs viewer
│   └── i18n/locales/
│       ├── en.ts                       # MODIFIED: add user-center/api-keys/audit keys
│       └── zh.ts                       # MODIFIED: mirror en.ts
└── packages/shared/src/
    ├── api-keys.ts                     # NEW: Zod schemas for API key I/O
    ├── user-center.ts                  # NEW: Zod schemas for profile/prefs I/O
    └── audit.ts                        # NEW: Zod schemas for audit I/O
```

**Structure Decision**: New code follows the existing monorepo layout. Server-only
code under `src/server/` (never imported by client). Shared Zod schemas in
`packages/shared/`. New route groups (`(user)`) keep URL structure clean without
affecting existing routes. The audit wrapper is applied to existing `/api/**`
routes as a minimal one-line change per export.

## Complexity Tracking

> Justified deviations from full scope. None are violations; all preserve the
> architectural invariants while deferring *data/features*.

| Deviation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| No key expiration (A5) | Spec FR-014 explicitly defers TTL. The `expires_at` column is trivially added later. | Building TTL UI + enforcement now is unused surface for this slice's user stories. |
| No email verification (A3) | 001 has no email service (A4). Adding one for email-change confirmation is disproportionate scope. | A verification flow requires an email transport, a token table, and a confirmation route — all out of scope for a single-service wiki. |
| No key rotation / re-encryption | The encryption scheme supports it, but rotation tooling (re-encrypt all keys with a new key) is operational infrastructure not needed at this scale. | A rotation script can be added as a standalone migration when the need arises. |
| Audit logging via wrapper (not middleware) | Next.js middleware runs in edge runtime (no PostgreSQL access). A route-handler wrapper is the lightest mechanism that can write to the DB. | Edge middleware + queue (e.g. pg-boss) adds an async hop and complexity for a sub-ms INSERT. |
| `share`/`run` scopes have no enforcement targets (A2) | These are forward-looking reservations per the spec. | Building enforcement for non-existent features is dead code. The scope enum and `can()` mapping are structured so enforcement activates trivially when features land. |
| No audit retention policy (A7) | Personal/small-team scale makes indefinite retention acceptable in PostgreSQL. | A retention cron / pg-boss job is operational overhead with no user-story coverage. |
| Fire-and-forget audit insert | The audit INSERT runs after the response is constructed. A failure in the INSERT must not fail the API request. | Synchronous transactional audit logging adds latency to every key-authenticated call. For a wiki, a best-effort audit log is sufficient. |
