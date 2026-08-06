# Phase 0 Research: Page Attachments

All items below were resolved by reading the existing implementation of the
directly analogous feature (embedded image assets: `content_assets`,
`content_blobs`, `storage_backends`, the `can()` permission chokepoint, API
key scopes, and the `/api/settings/*` admin pattern), plus a follow-up
architecture review that changed the §10 upload-delivery decision (and the
default size in §9) after initial drafting. No open decisions remain.

## 1. Where attachment bytes live

**Decision**: Reuse `content_assets` (metadata) + `content_blobs` (bytes)
verbatim, adding a new `kind = 'attachment'` value (today only `'image'`
exists). Reuse the existing pluggable Local/S3 replica mechanism
(`storage_backends`, `storage_replication_tasks`) unchanged — replication is
already generic over asset id, not image-specific.

**Rationale**: FR-005 requires attachments to reuse "the same durable,
administrator-configurable storage foundation" as images. `content_assets`
already stores arbitrary bytes keyed by content hash with a `kind`
discriminator column (plain `text`, not a Postgres enum — confirmed at
`apps/web/src/server/db/schema/index.ts:870`), so adding a second kind value
needs zero schema migration on that table. `content_blobs` is a
content-addressed bytea store with no image-specific assumptions.

**Alternatives considered**: A parallel `attachment_blobs`/`attachments`
table duplicating the storage/replication machinery — rejected as pure
duplication with no behavioral benefit and a second replication code path to
maintain, contradicting FR-005/FR-006's explicit "same shared" requirement.

## 2. How an attachment is linked to a page

**Decision**: A new `page_attachments` join table
(`id, page_id, asset_id, file_name, uploaded_by, created_at, removed_at,
removed_by`), populated directly by the attach/remove service calls — **not**
derived from scanning revision Markdown the way `content_asset_refs` is
populated (`content-assets.ts:syncRevisionAssetRefs` extracts asset ids
referenced *inline* in a revision's Markdown text).

**Rationale**: Attachments are explicitly not embedded inline (spec
Assumptions: "Attachments are a distinct concept from embedded page
images"), so there is no Markdown text to scan them out of; they need their
own page-level association. `file_name` lives on the join row (not on
`content_assets`) because `content_assets` is content-hash-deduplicated —
the same bytes could be reasonably attached under different names in
different places — while the edge case "two attachments with the same name
on one page are both kept as distinct attachments" requires the identity to
be the join row, not the (deduplicated) blob.

**Alternatives considered**: Extending `content_asset_refs` to also accept a
`page_id` (nullable `revision_id`) — rejected: that table's only consumer
(`syncRevisionAssetRefs`) is a delete-then-reinsert-from-markdown sync
keyed by revision id; overloading it with a second, page-scoped population
strategy would make its invariant ambiguous and risk the revision-sync delete
silently dropping page-level attachment rows it doesn't know about.

## 3. Permission model for write (attach / remove)

**Decision**: Add one new `Action` value, `attach_file`, to
`apps/web/src/server/permissions/index.ts`. `roleAllows('attach_file', ...)`
mirrors `edit` (`role === 'editor' || role === 'admin'`, or the author, per
existing `edit`/`publish` conventions for the resource kind). Add one new
`ApiKeyScope` enum value, `attachments`
(`packages/shared/src/api-keys.ts` + the `api_key_scope` Postgres enum), and
map it in `scopeToActions` to `['attach_file']` only — deliberately **not**
added to the `create`/`edit` scopes' mappings. Because `can()` for
`actor.kind === 'api_key'` requires *both* `actionAllowedByScope` and
`roleAllows` to pass, an API key needs the new `attachments` scope
specifically; holding only `create`/`edit` scopes is insufficient, which is
exactly the independent-permission behavior FR-007 requires. Session/browser
users (`actor.kind === 'user'`) never go through `actionAllowedByScope`, so
`attach_file` collapses to the same role check as `edit` for them — no new
concept for human authors, matching the spec's Assumptions.

The service-level gate (`canAttach(ctx, page)` in the new
`page-attachments.ts`, mirroring the existing `canUpload` in
`content-assets.ts`) additionally requires, only for `api_key` actors, that
`can(ctx, 'read', ...)` (or `read_draft` for an unpublished page) also
passes against the *specific target page* — implementing FR-007a. This is a
service-layer AND, not a `can()`-internal change, because "requires two
independent grants on the same resource" is a composition rule specific to
this one write path, not a general permission-model change.

**Rationale**: Directly implements FR-007/FR-007a and mirrors the existing
`scope ∩ role` intersection model (`permissions/index.ts:207-213` docblock)
rather than inventing a parallel authorization mechanism.

**Alternatives considered**: A boolean flag on the API key row ("can upload
attachments: yes/no") instead of a scope — rejected: scopes are already the
established, user-visible unit of API key permission granularity (create/
edit/delete/storage/preferences/…), and a one-off boolean would need its own
UI, its own audit-log field, and would not compose with the existing
scope-based `can()` chokepoint the way a new scope value does for free.

## 4. Permission model for read (list / download)

**Decision**: No new scope or action. Listing and downloading use the
existing `read`/`read_draft` actions against the page resource — exactly the
permission derivation `content-assets.ts:canReadAsset` already uses for
images, adapted to be `page_id`-direct (via `page_attachments.page_id`)
instead of transitive-through-`content_asset_refs`+`page_revisions`, since
attachments are not revision-scoped (see §2).

**Rationale**: Directly implements FR-003b, resolved in the `/speckit.clarify`
follow-up: reading was intentionally *not* given the same independent-scope
treatment as writing, because the original request only asked for
independent permission control on **upload**, and reusing the existing
page-read derivation is the smaller, more consistent change — an API key
that can already read a page's content today gains no new *capability
surface* by also being able to see/fetch what's attached to it.

## 5. Permission model for remove (detach)

**Decision**: Reuse the existing `edit` action — the same permission FR-004
already specifies ("a user who can edit a page remove an attachment") — for
**all** actor kinds, including API keys. No new scope gates removal.

**Rationale**: FR-004, unlike FR-007, was never qualified with an
independent-permission requirement, and no clarification introduced one for
removal. This intentionally makes removal asymmetric with attaching (an API
key with only `edit` scope, no `attachments` scope, can remove an attachment
it could not have uploaded) — flagged explicitly here because it is easy to
assume symmetry that the spec does not actually require. If this asymmetry
is undesirable, it is a one-line change (require `attach_file` instead of
`edit` in the remove handler) with no data-model impact; revisit if
product feedback disagrees.

## 6. Admin-configurable size/type limits

**Decision**: A new singleton table `attachment_settings`
(`id = 'default'`, `max_size_bytes`, `allowed_categories` (array/jsonb of
`'image' | 'video' | 'document'`), `updated_by`, `updated_at`), following
the exact existing singleton pattern of `site_settings` and
`system_theme_settings` (`id text primary key default 'default'`). Exposed
at `GET`/`PUT /api/settings/attachments`, mirroring the sibling routes under
`apps/web/app/api/settings/*` (analytics, search, spaces, site, …), gated by
the existing `manage_storage` action (same admin-only gate
`storage-config.ts`'s `isStorageAdmin` already uses — attachment limits are
content-storage policy, not a new permission domain). Categories map to a
fixed, code-owned MIME allowlist per category (see §7) — the admin picks
categories, not raw MIME lists, keeping the config surface small and safe.

**Rationale**: Implements FR-008/FR-009/FR-010. Today's image limit
(`CONTENT_ASSET_MAX_BYTES`, `IMAGE_CONTENT_TYPES`) is env-only with no admin
UI at all — confirmed by reading `apps/web/src/server/config.ts:17` and
`packages/shared/src/content-storage.ts:46-55` — so this is genuinely new
admin surface, not a UI added on top of an existing DB-backed setting. A
dedicated table (not new columns on `site_settings`) keeps "content policy"
separate from "site branding," matching how `system_theme_settings` and
`site_settings` are already kept as separate singleton concerns rather than
one growing settings blob.

**Alternatives considered**: Free-text MIME allowlist editing in the admin
UI — rejected as unnecessarily unsafe (an admin could accidentally allow
`text/html`, which FR-014 requires to always force-download regardless of
configuration) and harder to keep in sync with the sniffing logic in §7;
category toggles keep the two in lockstep by construction.

## 7. File type detection & category mapping

**Decision**: Extend the existing magic-byte sniffing pattern
(`content-store/image-validation.ts:sniffImageType`) into a new
`content-store/attachment-validation.ts`, detecting the fixed FR-010 set:
raster image signatures (PNG, JPEG, GIF, WebP), PDF `%PDF-`, ZIP-based
Office/OpenDocument formats via the ZIP local-file-header magic plus internal
`[Content_Types].xml` / `mimetype` entry sniffing, and MP4/WebM containers by
magic bytes. Plain text, Markdown, and CSV use a declared-`Content-Type`
fallback because they have no reliable magic number. SVG is deliberately
excluded from attachment validation: its existing image path sanitizes bytes,
which would violate the attachment contract's byte-for-byte delivery promise.
Each detected/declared type is mapped to exactly one of the three admin-facing
categories (`image`, `video`, `document`); an unrecognized type is always
rejected regardless of admin configuration (closed allowlist, not an open
denylist).

**Rationale**: Matches the existing project convention of never trusting a
client-declared content type over sniffed bytes where sniffing is possible
(`image-validation.ts`'s explicit comment: "the declared content type can
never be trusted over the actual bytes"), while acknowledging plenty of
legitimate document formats have no magic number and must fall back to the
declared type — this is a materially different validation shape from images
alone, hence a new module rather than extending `image-validation.ts`
in place.

**Alternatives considered**: A third-party file-type/magic-number library
(`file-type` npm package) — considered but not required for v1: the closed
category set (image/video/document) is small and the existing project
already hand-rolls this exact pattern for images with zero dependencies,
consistent with the constitution's general "no new default dependency
without justification" posture (P1). Revisit if the sniffing surface grows
materially during implementation.

## 8. Download response disposition (Content-Disposition)

**Decision**: A fixed, code-level (not admin-configurable) allowlist of
"browser-safe-to-render" types — PNG, JPEG, GIF, WebP, and
`application/pdf` — is served with `Content-Disposition: inline`. Every other
accepted type is served with `Content-Disposition: attachment`; HTML, SVG,
XML, and script-capable types are not accepted at all for attachments. The
filename value is validated before storage and safely encoded when forming the
response header.

**Rationale**: Implements FR-014, resolved in `/speckit.clarify` (Q1):
"inline for browser-safe types … forced download for all other types … and
any type where inline rendering could execute code in the wiki's own
origin." Keeping the allowlist in code rather than admin-configurable
prevents an administrator from ever creating a stored-XSS hole by
mis-marking a type as inline-safe — the spec's own wording ("MUST … MUST
NOT … regardless of administrator configuration") requires this to be
non-configurable.

**Alternatives considered**: Deriving "safe to render inline" from the
admin's category selection (e.g. all `document`-category types render
inline) — rejected because the `document` category as currently scoped
includes formats (e.g. certain XML-based document formats) that are not
uniformly safe to render inline across all browsers; a hand-picked, narrow,
code-reviewed allowlist is safer than deriving safety from an
administrator-facing grouping designed for a different purpose (accepted
upload types, not render safety).

## 9. Enforcing "reject in full, never truncate" (FR-011a)

**Decision**: Buffer the full multipart body (`Buffer.from(await
file.arrayBuffer())`, the same call already used at
`app/api/v1/assets/route.ts:23`), then check `bytes.length > maxBytes`
*before* any call into the content-store write path — identical to
`validateImage`'s existing `bytes.length > maxBytes` check
(`image-validation.ts:78`), which already returns a `too_large` result
without ever touching `writeImageAsset`. No streaming/early-abort mechanism
is introduced; the existing pattern already satisfies "fail outright, never
persist a partial file" because writes only ever happen after the full
buffer has passed validation. Now that the default cap is 20 MB (§10), this
buffered approach is comfortably within the synchronous-request budget it
needs to stay under.

No request-body size ceiling was found in this repository's Next.js config,
`docker-compose*.yml`, or `docker-compose.caddy.yml` that would truncate or
reject a request before it reaches application code — the existing 10 MB
image cap is purely an application-level check, not a proxy/framework limit.
Consequently the 20 MB default attachment cap needs no framework
configuration change; self-hosters who front the deployment with their own
reverse proxy remain responsible for that proxy's own body-size limit, same
as today.

**Rationale**: Directly satisfies the explicit follow-up requirement ("上传
内容超过大小要失败，不要直接截断") captured as FR-011a/SC-003. Reusing the
exact existing pattern (rather than inventing streaming size-limiting)
keeps the change minimal and consistent with KISS/避免过度设计.

## 10. Upload delivery vs. P7 (Async-First for Heavy Operations)

**Status: resolved (2026-08-06 architecture review).** The synchronous,
buffered multipart approach in §9 satisfies the no-partial-write
requirement, but an architecture review correctly flagged that at the
originally-clarified 100 MB default, a synchronous upload could plausibly
exceed P7's 500ms threshold — P7 expressly lists "large asset processing"
as covered, and existing synchronous image-upload behavior at a 10 MB cap
is not, by itself, a blanket exception at ten times that size.

Two compliant paths were on the table:

1. Stage bytes through an upload-session flow and return an operation ID;
   use pg-boss for validation, durable attachment creation, replication, and
   status updates.
2. Narrow the feature's maximum size so the operation demonstrably cannot be
   a large/slow operation under P7.

**Decision: path 2.** The default maximum attachment size is lowered from
100 MB to **20 MB** (spec's Architecture Review clarification supersedes
the earlier 100 MB clarification; FR-010/SC-001/data-model.md updated
accordingly). This is not a re-assertion of "network transfer time doesn't
count" — it is a genuine reduction in the bound on server-side work per
request. The per-attachment server-side cost (magic-byte sniffing, sha256
hashing, one `content_blobs` write) scales with byte count; at 20 MB it sits
in the same sub-second range the already-shipped 10 MB image-upload path
runs in today, comfortably under the 500ms threshold on ordinary hardware.
Path 1 (staged/async upload) was rejected for v1 as disproportionate
complexity and a UX regression against SC-001's "attach and see it
immediately" expectation — revisit it if a future need for materially
larger attachments (e.g. long-form video) arises. An administrator who
raises the configured limit above the default knowingly opts out of the
synchronous-stays-fast guarantee this decision provides; that tradeoff is
theirs to make, not something this feature needs to protect against.

## 11. MCP tool surface

**Decision**: Three new MCP tools, mirroring `upload_image`'s existing
shape (`packages/mcp-server/src/tools/upload-image.ts`,
`server.ts:149`): `attach_file` (base64 bytes + filename + target page →
attachment metadata), `list_attachments` (page → attachment metadata array),
`download_attachment` (attachment id → base64 bytes + metadata). Each is a
thin wrapper calling new `WikiApiClient` methods
(`attachFile`/`listAttachments`/`downloadAttachment`) that hit the new
`/api/v1/pages/{pageId}/attachments` and `/api/v1/attachments/{id}` REST
endpoints — the same "one shared HTTP client, thin MCP wrapper" shape
`uploadImage` already uses, so MCP and the public REST API are provably the
same code path (FR-003a/FR-006).

**Rationale**: Directly implements User Story 5 and the FR-003a/FR-003b read
parity, using the established pattern rather than a new one.
