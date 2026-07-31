# Phase 1 Contracts: Admin API and Artifact

**Feature**: `031-static-site-publishing` | **Date**: 2026-07-31

Two contracts: the REST surface an operator drives, and the artifact contract the
published site satisfies for its readers.

---

## 1. REST surface

Base: `/api/static-site`. Deliberately **not** under `/api/storage`, where Git
export lives — these are different features (FR-002), and colocating them would
invite the "duplicate entry points" reading the spec exists to prevent.

All routes follow the established house pattern: `createApiContext()` for the
actor, `withApiAudit()` wrapping the handler, `parseJson()` with a Zod schema
from `@next-wiki/shared`, `mapDomainError()` for `DomainError`, and an
`@openapi` JSDoc block placed directly above each `export` (never a single-line
JSDoc — the generator corrupts `@summary` when the block is collapsed, and
`@response` must name a type that is unique across the workspace).

All routes require Admin (FR-035). Denial returns the standard error shape and
discloses nothing about whether a target exists.

### `GET /api/static-site/target`

Current configuration with the credential masked. `hasSecret: boolean` replaces
the secret; the secret is never returned (FR-034).

**Response** `StaticSiteTargetView`:

```jsonc
{
  "id": "uuid",
  "isEnabled": true,
  "remoteUrl": "https://github.com/owner/repo.git",
  "branch": "gh-pages",
  "baseUrl": "https://owner.github.io/repo/",
  "authMode": "https_token",
  "username": "x-access-token",
  "hasSecret": true,
  "publicKey": null,           // ssh mode only
  "fingerprint": null,
  "autoPublishOnChange": true,
  "scheduledPublishEnabled": false,
  "scheduledIntervalMinutes": 60,
  "isStale": false,
  "lastPublication": { /* StaticSitePublicationView | null */ }
}
```

Returns `null` when no target is configured.

### `PUT /api/static-site/target`

Create or update the target. Body `StaticSiteTargetUpsert`: the view's writable
fields plus an optional write-only `secret`. Omitting `secret` on an update
keeps the stored one. Enabling without a stored secret is a validation error.

- `200` when saved disabled.
- `202` when saved enabled, since enabling queues an initial publish; the body
  includes the queued `publicationId`.

### `DELETE /api/static-site/target`

Removes the configuration and destroys the stored credential (FR-037). Does not
touch the already-published site — taking the site down is a separate,
explicitly confirmed act (below), so deleting configuration can never silently
unpublish. `204`.

### `POST /api/static-site/target/ssh-key`

Generates a keypair for `ssh` auth, stores the private half encrypted, and
returns the public half and fingerprint so the operator can install it as a
deploy key. Mirrors the existing Git export SSH-key route. `201`.

### `GET /api/static-site/eligibility`

Pre-publish summary (FR-012). Counts only — never titles or paths, so this
endpoint cannot become a disclosure channel for restricted content.

```jsonc
{
  "publishable": 128,
  "excluded": 41,
  "exclusionsByReason": {
    "not_published": 12,
    "deleted": 3,
    "restricted": 9,
    "space_not_anonymous": 6,
    "space_kind_raw": 8,
    "space_kind_generated": 3
  }
}
```

### `GET /api/static-site/publications`

Run history, newest first. Supports `limit` and `cursor`.
Response: `{ items: StaticSitePublicationView[], nextCursor: string | null }`.

### `POST /api/static-site/publications`

Starts a publish (FR-028). Returns immediately with the created run.

- `202` with `StaticSitePublicationView` in `queued`.
- If a run is already active, returns the active run and records that a
  follow-up is needed rather than creating a second queued row (FR-030).
- `409` when no target is configured or the target is disabled.

### `GET /api/static-site/publications/{id}`

One run, for status polling.

`StaticSitePublicationView`:

```jsonc
{
  "id": "uuid",
  "status": "succeeded",
  "trigger": "manual",
  "startedAt": "2026-07-31T09:00:00.000Z",
  "completedAt": "2026-07-31T09:02:11.000Z",
  "pagesPublished": 128,
  "assetsPublished": 57,
  "pagesExcluded": 41,
  "exclusionsByReason": { "restricted": 9, "space_kind_raw": 8 },
  "bytesTotal": 18234112,
  "commitSha": "a1b2c3d",
  "forcedPush": false,
  "errorMessage": null
}
```

`errorMessage` is redacted of credential material before it is stored, so it is
safe to display verbatim (FR-034).

### `DELETE /api/static-site/site`

Takes the published site down (FR-036): removes published content from the
target so previously published addresses stop serving it. Runs as a job with
`trigger: "takedown"` and appears in history like any other run.

Requires an explicit confirmation token in the body
(`{ "confirm": "<branch name>" }`) so it cannot be triggered by a stray request;
the UI presents this as typing the branch name, and states plainly that the
public site will become unavailable.

`202` with the queued run. A takedown requested while a publish is running
cancels the pending rerun so the site is not immediately republished.

**On URL shape**: `DELETE` on the *site* resource expresses takedown without a
verb-style path (`/unpublish`, `/takedown`), satisfying P11. Deleting the site
and deleting the target are different resources with different consequences,
which is why they are different addresses.

---

## 2. Artifact contract

What the published site guarantees to a reader. This is the contract the E2E
suite asserts against a snapshot served by a plain static file server with the
wiki unreachable.

### Serving

- Every document is a complete HTML file requiring no host-side build
  (FR-003); `.nojekyll` at the root enforces verbatim serving.
- The site is servable both from a domain root and from a sub-path, determined
  solely by the configured base path (FR-006).
- Unmatched addresses are served `404.html` by the host.

### Document guarantees

Each published document:

1. Renders body content byte-identical in structure to the wiki reader's output
   for the same revision, because both come from `renderMarkdown()` (FR-015).
2. Carries navigation of the published tree, breadcrumbs, and an in-page table
   of contents (FR-016).
3. Gives every heading a stable, linkable id from the shared slugifier, so
   anchors survive republishing (FR-017).
4. Contains no control requiring the wiki: no edit, AI, admin, account, or
   sign-in affordance (FR-019).
5. References no address outside the artifact except links the page's own author
   wrote — no wiki callback, no CDN (FR-020).
6. Declares its content language, and offers a switcher listing only
   translations that exist (FR-024, FR-025).
7. Applies the deployment's appearance tokens and honors a stored light/dark
   choice before first paint (FR-018).

### Search guarantees

- Queries execute entirely in the browser (FR-021).
- The index is chunked: a first query fetches only the shards it needs, never
  the whole corpus (FR-023).
- Chinese queries match without manual word delimiting (FR-022).
- The index derives from the generated HTML only, so it cannot contain a page
  the artifact does not contain (FR-008).

### Negative guarantee (release blocking)

For any page that fails FR-007 eligibility, **no byte** of the artifact contains
its title, path, excerpt, body, metadata, tags, assets, navigation entry,
breadcrumb entry, sitemap entry, or search entry (FR-008, SC-002). Links that
would have pointed at it are plain text carrying no address (FR-009).

This is asserted directly: generate a snapshot from a fixture wiki containing
restricted pages, non-anonymous spaces, raw and generated spaces, and
cross-links into all of them, then scan every file in the artifact for each
excluded page's title, path, and asset id.
