# Research: Content Import and Export

## R1 — Use lazy streaming ZIP libraries

**Decision**: Use `yazl` to create ZIP archives and `yauzl` with lazy entries and
entry-size validation to read uploads. Write exports to an opaque `.partial`
artifact, hash while streaming, then atomically rename when complete. Never call
an extract-all helper and never materialize the whole archive in memory.

**Rationale**: The feature targets multi-gigabyte archives. Both libraries expose
stream-based APIs and keep ZIP entry handling explicit. Lazy iteration allows
the application to enforce entry count, compressed size, expanded size,
compression ratio, path, and declared-manifest limits before opening entry
streams.

**Alternatives considered**:

- `adm-zip` / whole-buffer libraries: rejected because they encourage loading
  the entire archive and make bounded processing harder.
- Shelling out to `zip`/`unzip`: rejected because it adds an OS-tool dependency,
  complicates cross-platform tests, and increases command/path injection risk.
- One generic archive package with automatic extraction: rejected because the
  security-critical validation flow must remain explicit.

## R2 — Define a versioned portable archive

**Decision**: Archive v1 contains:

```text
manifest.json
pages/{locale}/{canonical-path}.md
assets/{sha256}.{ext}
reports/export.json
```

Each Markdown file begins with YAML frontmatter. The manifest is authoritative
for inventory, relationships, checksums, sizes, and format version. Page paths
are normalized canonical paths; the reserved `_root.md` name represents a
future root page. Asset filenames are content-addressed.

**Rationale**: Markdown + frontmatter satisfies the open-standard mandate and is
human-readable outside next-wiki. The manifest provides machine validation and
evolution without relying on filenames alone. Content-addressed assets dedupe
naturally and avoid source filename collisions.

**Alternatives considered**:

- Database dump: rejected because it is not portable, safe to merge, or
  compatible across versions.
- Markdown-only tree without manifest: rejected because it cannot validate
  completeness, represent relationships reliably, or evolve compatibly.
- Opaque page filenames only: rejected because readable canonical paths improve
  manual inspection and interoperability.

## R3 — Store large transfer artifacts outside PostgreSQL

**Decision**: Persist metadata in PostgreSQL and ZIP/report bytes in
`TRANSFER_ARTIFACT_BASE_PATH` (default `/data/content/transfers`) using
server-generated UUID filenames. The directory is inside the existing mounted
content volume. Add a small `TransferArtifactStore` abstraction with a local
implementation; do not overload `ContentStore`, whose contract is authoritative
Markdown/image storage.

**Rationale**: PostgreSQL `bytea` is inappropriate for the 2-GB target. The
existing deployment already mounts `/data/content`, so this adds no service and
keeps artifacts available across restarts. Separating operational artifacts from
authoritative content prevents migration ZIPs from appearing as wiki assets.

**Alternatives considered**:

- Store ZIP bytes in PostgreSQL: rejected for size, memory, backup, and streaming
  concerns.
- Require S3: rejected because it violates the default-deployment constraint.
- Extend `ContentStore` with arbitrary files: rejected because it broadens the
  authoritative content abstraction with temporary operational data.

## R4 — Upload as a reserved artifact plus streamed content

**Decision**: Create an upload artifact record first, then stream raw
`application/zip` bytes with `PUT /api/transfer-artifacts/{id}/content`. Enforce
the compressed-byte limit while streaming, hash the upload, fsync/close, and
atomically finalize. `multipart/form-data` is not the primary large-upload
contract.

**Rationale**: Request `formData()` may buffer large files. A reserved,
permission-scoped artifact supports progress, retry, bounded disk use, and a
clear transition from `uploading` to `ready`.

**Alternatives considered**:

- Single multipart POST: acceptable only for small files, rejected as the
  canonical 2-GB flow.
- Direct browser write to arbitrary filesystem path: rejected for security.
- Chunk protocol in v1: deferred; a repeatable idempotent PUT is sufficient for
  the first release and simpler to operate.

## R5 — Preview is a durable background run

**Decision**: Archive validation/preview and Wiki.js discovery/preview are
pg-boss runs with per-item records. Import can start only from a successfully
completed preview whose source fingerprint and options still match.

**Rationale**: Preview may scan thousands of entries or make thousands of remote
requests, exceeding the 500-ms constitutional threshold. Persisting preview
items prevents duplicate discovery during confirmation and makes the exact
planned effects auditable.

**Alternatives considered**:

- Preview synchronously in the upload request: rejected for timeout and memory
  risk.
- Recompute preview when import starts: rejected because source/archive changes
  could make the confirmed view differ from execution.

## R6 — Item-level idempotency and replacement semantics

**Decision**: Give every source page/asset a stable source key and fingerprint.
Persist source-to-target mappings. Completed items are skipped on retry when the
fingerprint and selected options match. New pages create revision 1 and publish
it; replacement appends and publishes a new revision through an import-specific
service that shares the existing rendering, asset-reference, replication, Git,
and AI-index hooks.

**Rationale**: A single transaction for an entire site is infeasible. Atomic
item writes plus durable mappings provide safe resume while preserving normal
revision guarantees.

**Alternatives considered**:

- Whole-import transaction: rejected because remote I/O and large byte writes
  cannot be held inside a long database transaction.
- Upsert page rows directly: rejected because it bypasses immutable revisions
  and post-publish hooks.
- Derive idempotency from path only: rejected because replacement and changed
  source content need distinct fingerprints.

## R7 — One active mutating import, exports may coexist

**Decision**: `transfer_runs.active_mutation_slot` is `true` only for archive or
Wiki.js import runs and is protected by a partial unique index. Imports also
check the existing content-storage migration gate. Exports and previews may run
concurrently because they use captured revision/source fingerprints; cleanup
must not delete artifacts referenced by active runs.

**Rationale**: Concurrent content writers make path conflict outcomes and retry
mappings nondeterministic. Read-only export/preview work does not need the same
global exclusion when snapshots are explicit.

**Alternatives considered**:

- Serialize every transfer: safe but unnecessarily blocks backups and previews.
- Rely only on pg-boss queue concurrency: rejected because multiple processes or
  manually enqueued jobs need a database invariant.

## R8 — Wiki.js uses list then single-page queries

**Decision**: Support Wiki.js 2.2+. Authenticate to `{baseUrl}/graphql` with a
Bearer API token. Query `pages.list(orderBy: ID, orderByDirection: ASC)` for the
permission-filtered inventory, then `pages.single(id)` for source content,
editor, content type, locale, description, tags, and timestamps.

**Rationale**: Wiki.js documents `/graphql` and Bearer API tokens. Its schema
returns all pages visible to the token from `pages.list`, and source content is
available on `pages.single` only with source-read/manage permissions. Separating
inventory and detail requests supports progress and item retries.

**Alternatives considered**:

- Scrape rendered pages: rejected because source Markdown and metadata are lost.
- Query the Wiki.js database directly: rejected because it couples to internal
  storage and deployment details.
- GraphQL introspection-driven dynamic queries: rejected by explicit
  registration and predictable-contract requirements.

## R9 — Localize only referenced images

**Decision**: Parse each source document for image references. Resolve
root-relative and relative Wiki.js image URLs against the source page/base URL.
Download same-origin Wiki.js images with the source Bearer token; public
cross-origin images are fetched without forwarding credentials. Validate bytes
with the existing raster image validator, dedupe by SHA-256, store through
content asset services, and rewrite references to `/api/assets/{id}`.

**Rationale**: The Wiki.js asset GraphQL schema lists metadata but does not return
asset bytes or a canonical download URL. Page references identify the assets
that actually matter. Never forwarding the token cross-origin prevents
credential leakage.

**Alternatives considered**:

- Import all Wiki.js assets: rejected because unused files increase migration
  size and the API requires recursive folder enumeration.
- Preserve remote URLs: rejected because the target would depend on the source.
- Forward the token to every image host: rejected as credential disclosure.

## R10 — Explicitly supported content conversion

**Decision**: Preserve source verbatim when Wiki.js reports Markdown
(`contentType: text/markdown` or markdown editor). Convert HTML/CKEditor content
with `turndown`, with explicit rules for headings, links, images, code, tables,
and line breaks. Mark converted items. Skip unsupported source formats such as
AsciiDoc until a registered converter exists.

**Rationale**: Silent lossy conversion is unsafe. An explicit converter registry
keeps behavior testable and allows future formats without dynamic discovery.

**Alternatives considered**:

- Import rendered HTML as Markdown: rejected because HTML is not canonical raw
  Markdown and violates the rendering mandate.
- Convert every unknown format heuristically: rejected because data loss would
  be difficult to detect.

## R11 — SSRF-safe remote fetching with trusted-source opt-in

**Decision**: Accept only HTTP(S), reject URL credentials/fragments for source
configuration, normalize hostnames, resolve all A/AAAA addresses, and reject
loopback, link-local, multicast, unspecified, and private ranges by default.
Revalidate every redirect and connect only to a validated resolved address.
Provide an explicit `allowPrivateNetwork` admin option for a trusted Wiki.js
base host; it applies only to that configured host and its same-origin assets,
not arbitrary cross-origin page links.

Use bounded timeouts, redirects, bytes, content types, and concurrency. Never
forward the Wiki.js token to a different origin.

**Rationale**: Self-hosted Wiki.js often runs on an internal network, but
arbitrary URL fetching is an SSRF surface. A narrow, visible trust exception for
one configured source balances migration utility and safety. OWASP recommends
allowlisting known applications, validating resolved addresses, and controlling
redirects.

**Alternatives considered**:

- Block all private addresses: safest but prevents common same-LAN migrations.
- Allow all admin-entered URLs: rejected because compromised admin sessions or
  malicious imported content could probe internal services.
- Check hostname only once: rejected due to redirects and DNS rebinding.

## R12 — URL-backed admin UX

**Decision**: Add one canonical `/admin/transfers` entry with `tab`, filters,
pagination, conflict strategy, and selected source in search parameters.
`/admin/transfers/{id}` is the canonical deep link for run detail. Use TanStack
Query polling for server state and existing shared UI primitives.

**Rationale**: This satisfies browser navigation and frontend data-flow
mandates. Long-running jobs remain observable after refresh or sign-in.

**Alternatives considered**:

- Modal-only run details: rejected because operational records must be
  bookmarkable and shareable.
- Store run responses in Zustand: rejected because they are server state.

## R13 — Retention, cleanup, and audit

**Decision**: Default artifact retention is 72 hours and configurable from 1 to
720 hours. A scheduled pg-boss cleanup removes expired files only after marking
metadata and verifying no active run references them. Keep run/item/mapping
metadata for audit after artifact expiry. Audit source create/update/delete/test,
run create/cancel/retry, artifact upload/download/delete, and archive download.

**Rationale**: ZIPs may contain sensitive wiki content and consume significant
disk. Separating artifact retention from durable operational history minimizes
exposure while preserving accountability.

**Alternatives considered**:

- Retain archives indefinitely: rejected for privacy and disk growth.
- Delete all run metadata with the ZIP: rejected because audit and retry
  diagnosis would be lost.

## Primary References

- [Wiki.js GraphQL API overview and bearer-token authentication](https://docs.requarks.io/dev/api)
- [Wiki.js page GraphQL schema](https://github.com/Requarks/wiki/blob/6f042e97cc2d3acda6b6ff611de8e0faacce91c1/server/graph/schemas/page.graphql)
- [Wiki.js asset GraphQL schema](https://github.com/Requarks/wiki/blob/6f042e97cc2d3acda6b6ff611de8e0faacce91c1/server/graph/schemas/asset.graphql)
- [Wiki.js page resolver permission filtering](https://github.com/Requarks/wiki/blob/6f042e97cc2d3acda6b6ff611de8e0faacce91c1/server/graph/resolvers/page.js)
- [Wiki.js asset resolver and folder hierarchy](https://github.com/Requarks/wiki/blob/6f042e97cc2d3acda6b6ff611de8e0faacce91c1/server/graph/resolvers/asset.js)
- [yauzl streaming ZIP reader](https://github.com/thejoshwolfe/yauzl)
- [yazl streaming ZIP writer](https://github.com/thejoshwolfe/yazl)
- [Turndown HTML-to-Markdown converter](https://github.com/mixmark-io/turndown)
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Node.js DNS lookup API](https://nodejs.org/api/dns.html#dnspromiseslookuphostname-options)
