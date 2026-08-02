# Phase 1 Data Model: Static Site Publishing

**Feature**: `031-static-site-publishing` | **Date**: 2026-07-31

Two persisted tables, one derived in-memory model, and one artifact layout
contract. Column names are `snake_case`; the Drizzle schema in
`apps/web/src/server/db/schema/index.ts` is the authoritative definition.

> **Migrations**: the SQL migration and its snapshot MUST be produced by running
> `pnpm db:generate` against the edited schema files. Never hand-author the
> `.sql` file or touch `meta/_journal.json` — see the project's CLAUDE.md for why
> this has broken the snapshot chain before. Run `pnpm db:generate` a second
> time with no further edits and confirm it reports no changes.

---

## Persisted entities

### `integrations`

Credentials for an external service, owned by no single feature.

Git export and static site publishing both authenticate against the same GitHub
account, so the credential belongs to neither of them. A per-feature credential
would mean two deploy keys to install — which hosts reject anyway, since
deploy-key uniqueness is enforced globally — and two places to rotate.
Independence between those features is about change coupling, not about
duplicating shared infrastructure.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `kind` | enum(`github`) NOT NULL, unique | One row per service: a credential identifies an account, and a deployment has one account per service. |
| `label` | text NULL | Operator-facing name, e.g. the account or organization. |
| `auth_mode` | enum(`https_token`, `ssh`) NOT NULL | |
| `username` | text NULL | For `https_token`. |
| `secret_encrypted` | text NULL | Encrypted via `crypto/key-encryption`. Never returned to any client. |
| `public_key` / `fingerprint` | text NULL | The installable half of an SSH deploy key, and its fingerprint. |
| `created_at` / `updated_at` | timestamptz NOT NULL | |

**Deletion** is refused while a feature still references the row; the FK from
`static_site_targets` is `ON DELETE restrict` and the service turns that into a
readable error. Silently breaking publishing would be worse than requiring the
operator to disconnect deliberately.

### `static_site_targets`

Where and how the site is published. One row per configured target; this
iteration supports a single active target per deployment.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `is_enabled` | boolean NOT NULL default false | Master switch (FR-036). Disabled targets accept no triggers. |
| `remote_url` | text NOT NULL | HTTPS or SSH remote, no embedded credentials. |
| `branch` | text NOT NULL | Destination branch, fully owned by this feature. |
| `base_url` | text NOT NULL | Public address the host serves, e.g. `https://user.github.io/wiki/`. Its path component yields the artifact base path (FR-006). |
| `provider` | enum(`github_pages`) NOT NULL | Which host serves the site. The artifact is host-neutral, so this is expected to grow. |
| `integration_id` | uuid NULL FK → `integrations.id` ON DELETE restrict | Where the credential comes from. Not stored here: the account reached is the same one Git export reaches. |
| `auto_publish_on_change` | boolean NOT NULL default false | FR-029. |
| `scheduled_publish_enabled` | boolean NOT NULL default false | FR-029. |
| `scheduled_interval_minutes` | integer NOT NULL default 60 | Bounded 5..1440, matching the Git export bounds. |
| `is_stale` | boolean NOT NULL default false | Set by public-content mutations; cleared on a successful publish. |
| `last_publication_id` | uuid NULL | Most recent run, for cheap status reads. App-enforced reference, consistent with the existing `current_published_version_id` convention. |
| `created_at` / `updated_at` | timestamptz NOT NULL | |

**Validation** (Zod, in `packages/shared/src/static-site.ts`):

- `remote_url` reuses the existing Git remote rule: HTTPS or SSH, no credentials
  embedded in the URL.
- `branch` reuses the existing branch-name rule (no leading `-`, no `..`, no
  whitespace or Git metacharacters).
- `base_url` must be an absolute `http`/`https` URL. Its path is normalized to a
  leading-and-trailing-slash form (`/` for a domain root, `/wiki/` for a project
  sub-path).
- Enabling a target requires a stored secret.

**Deletion**: removing a target cascades to its publication history. It does not
destroy the credential — that belongs to the integration and other features may
still be using it.

---

### `static_site_publications`

One row per publish attempt (FR-032). Append-only operational history; not
content versioning.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `target_id` | uuid NOT NULL FK → `static_site_targets.id` ON DELETE CASCADE | |
| `status` | enum(`queued`, `running`, `succeeded`, `failed`, `cancelled`) NOT NULL | See state transitions below. |
| `trigger` | enum(`manual`, `content_change`, `scheduled`, `takedown`) NOT NULL | Distinguishes a takedown run from a content publish. |
| `started_at` | timestamptz NULL | Set on transition to `running`. |
| `completed_at` | timestamptz NULL | Set on any terminal transition. |
| `pages_published` | integer NOT NULL default 0 | |
| `assets_published` | integer NOT NULL default 0 | |
| `pages_excluded` | integer NOT NULL default 0 | |
| `exclusion_summary` | jsonb NOT NULL default `{}` | Counts keyed by exclusion reason (see below). Counts only — never titles or paths, so history cannot become a disclosure channel. |
| `bytes_total` | bigint NOT NULL default 0 | Snapshot size, for limit diagnostics. |
| `commit_sha` | text NULL | Delivered commit, for operator traceability. |
| `forced_push` | boolean NOT NULL default false | True when divergence required `--force-with-lease`. |
| `error_message` | text NULL | Redacted of credential material before storage (FR-034). |
| `created_at` | timestamptz NOT NULL | |

**Indexes**: `(target_id, created_at DESC)` for history listing.

**Exclusion reason keys** (stable identifiers, used in `exclusion_summary` and
surfaced in the UI grouped by reason, FR-012):

| Key | Meaning |
|---|---|
| `not_published` | No published revision. |
| `deleted` | Soft-deleted page. |
| `restricted` | `pages.visibility = 'restricted'`. |
| `space_not_anonymous` | Space disallows anonymous reading. |
| `space_kind_raw` | Raw-capture space (FR-013). |
| `space_kind_generated` | Generated-knowledge space (FR-013). |

**State transitions**:

```text
queued ──► running ──► succeeded
   │          │
   │          └──────► failed
   └─────────────────► cancelled      (target disabled/removed before start)
```

- Only one non-terminal run per target at a time. A trigger arriving while a run
  is active sets a rerun flag rather than creating a second `queued` row
  (FR-030), matching the coalescing already used by Git export.
- A run that fails leaves the delivered site untouched (FR-031); failure is a
  property of the run record, never of the artifact.

---

## Derived model (in memory, per run)

Never persisted. Rebuildable by definition — a projection over page revisions,
consistent with the constitution's treatment of derived indexes.

### `PublishableSet`

Produced by `eligibility.ts` in **one** query. The single decision point for
FR-007; every other stage consumes this and queries nothing further about
eligibility.

```text
PublishableSet {
  pages: PublishablePage[]      // eligible pages with published revision content
  pageIdsByPath: Map<(locale, path) → pageId>   // link resolution
  translationGroups: Map<groupId → { locale → path }>  // language switcher
  assetIds: Set<assetId>        // referenced by eligible published revisions only
  exclusions: Record<ExclusionReason, number>   // counts only
}

PublishablePage {
  id, spaceId, path, locale, title
  translationGroupId | null
  revisionId, versionNumber, publishedAt
  contentSource                 // read via readMarkdownFromDatabase
}
```

**Invariant**: a page id absent from `PublishableSet.pages` must not appear in
any generated byte — document, navigation, breadcrumb, sitemap, link, asset, or
search index. This is the assertion the release-blocking leak test makes.

### `SnapshotManifest`

Produced by `snapshot.ts`; consumed by preflight and delivery.

```text
SnapshotManifest {
  rootDir            // temp directory holding the complete artifact
  basePath           // normalized from target.base_url
  documents: { address, filePath, bytes }[]
  assets:    { assetId, filePath, bytes }[]
  totalBytes, largestFileBytes
  counts: { pages, assets, excluded }
}
```

---

## Artifact layout contract

The delivered branch contains exactly this and nothing else — the working tree
is replaced wholesale each run (FR-004), so foreign files do not survive.

```text
/
├── .nojekyll                    # host serves files verbatim; no build (FR-003)
├── index.html                   # site home: published page tree (FR-005)
├── 404.html                     # styled not-found (FR-005)
├── sitemap.xml                  # public addresses for search engines (FR-005)
├── <path>/index.html            # one document per publishable page
├── <locale>/<path>/index.html   # translations (FR-024)
├── _static/                     # reserved: build-time assets, content-hashed
│   ├── site.<hash>.css          # compiled globals.css
│   ├── site.<hash>.js           # client runtime
│   ├── katex.<hash>.css
│   └── fonts/                   # KaTeX fonts only
├── _assets/<assetId>.<ext>      # reserved: referenced images (FR-010)
└── pagefind/                    # reserved: chunked search index (FR-023)
```

**Reserved prefixes**: `_static/`, `_assets/`, `pagefind/`, and the root files
above. A page path colliding with any of these fails the run with the conflict
named, rather than silently dropping the page.

**Address form**: a page at wiki path `guides/setup` is written to
`guides/setup/index.html` and addressed as `<basePath>guides/setup/`, matching
the wiki's own reader URL shape (P11). Non-ASCII path segments are written in
NFC-normalized literal form and percent-encoded in links. Two distinct paths
differing only in case are a hard error, because the host's filesystem may not
distinguish them.

**Self-containment**: every `href`/`src` in a document resolves either inside
this tree or to an external address the page's own author wrote. No reference
points at the wiki instance or a third-party CDN (FR-020).

---

## Relationship to existing entities

| Existing entity | Relationship |
|---|---|
| `pages` | Read-only source. Filtered on `deleted_at`, `visibility`, `current_published_version_id`. |
| `page_revisions` | Read-only. Only the current published revision of each eligible page. |
| `spaces` | Read-only. Filtered on `anonymous_read` and `kind`. |
| `content_assets` / `content_asset_refs` | Read-only. Assets reachable from eligible published revisions only. |
| `storage_backends` | **No relationship.** Deliberately independent (FR-002). |

The feature creates no page, revision, tag, or asset, and mutates no existing
content table. Its only writes are its own two tables.
