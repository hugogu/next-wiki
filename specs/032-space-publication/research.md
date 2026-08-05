# Research: Configurable Space Publication

## D1 — Preserve stable space identity; add presentation settings

**Decision**: Keep `spaces.slug` and `spaces.kind` as stable internal identity
and behavior keys. Add a display name, a unique public route prefix, and a
per-space default page visibility. Do not repurpose `slug` as a URL.

**Rationale**: Services, jobs, imports, API parameters, and historical records
use `default`, `raw`, and `generated` as stable identifiers. Changing them to
follow a user-facing path would make a route rename a data migration and risk
breaking references. `pages.visibility` already expresses per-page anonymous
access, so defaults belong to space configuration rather than identity.

**Alternatives considered**: Rename `spaces.slug` (rejected: presentation
would break stable references); keep the hard-coded `ReaderSpace` union
(rejected: it cannot represent configured paths or prefix history).

## D2 — Public pages use one configured prefix-derived route

**Decision**: The existing public catch-all reader becomes the only anonymous
document resolver. Its first content segment resolves against a cached set of
configured space prefixes, then the remaining path resolves in that space.
Every space, including Wiki, has a prefix-derived public canonical URL.

**Rationale**: A sibling dynamic route for configurable prefixes would overlap
the existing catch-all. Reusing it avoids competing routes and preserves
on-demand ISR. Existing bare Wiki URLs and old `/spaces/<space>/...` URLs are
legacy inputs, never new canonical URLs.

**Alternatives considered**: A second public dynamic route (rejected: route
precedence risk); retain Wiki at root forever (rejected: it leaves Wiki
structurally exceptional and prevents fully configurable space routes).

## D3 — Separate static public reading from protected workspace reading

**Decision**: The prefix-derived public reader resolves only public, published
pages and remains static/ISR. The authenticated workspace reader stays dynamic
for restricted work; when its target is public it redirects to the canonical
public reader URL.

**Rationale**: A static document cannot query a session or render protected
content without violating P12. This preserves one public canonical address
without turning a protected reader into a cache leak.

**Alternatives considered**: Make the public route dynamic for logged-in
readers (rejected by P12); client-fetch private content in a public document
(rejected: complicates access controls and weakens page readability).

## D4 — Page visibility, not space kind, controls anonymous read

**Decision**: Anonymous eligibility is: enabled space + public page visibility
+ current published revision. Remove the raw/generated blanket read denial
from the central permission logic, but retain their create/edit/publish/delete
rules. Treat the old space-level anonymous-read switch as retired compatibility
state rather than a second public-read veto.

**Rationale**: Existing `visibility` persists the required page-level state,
but raw/generated checks run before it. A second space veto makes a public
generated page impossible. Migration defaults preserve today’s behavior:
Wiki public; raw/generated restricted.

**Alternatives considered**: Add a generated-only visibility state (rejected:
special case); retain `anonymous_read` as a read veto (rejected: contradicts
page-level external visibility).

## D5 — Validate prefixes and preserve old prefixes with aliases

**Decision**: A space prefix must be non-empty, normalized, unique across
current and retired aliases, and not shadow built-in routes or an existing
legacy/canonical page address. A change creates a durable alias that maps only
to the new canonical prefix; both old and new public paths are invalidated.

**Rationale**: Prefixes occupy the first segment of the public catch-all.
Ambiguity would hide pages or create two canonical documents. Persistent aliases
make renamed links work without a second reader model.

**Alternatives considered**: Redirect in memory only (rejected: restarts lose
old links); permit two live prefixes indefinitely (rejected: violates one
canonical URL).

## D6 — Retire link pages without deleting history

**Decision**: Retire active `kind='link'` rows in an Admin-authorized,
transactional operation. Soft-delete each link, record a private retirement
report/legacy redirect record, and keep its enum value, columns, and revisions
historical-only for now. New link inputs are rejected.

**Rationale**: Database checks tie `kind='link'` to its target column;
dropping/clearing those fields destroys or invalidates historical revisions.
Soft retirement satisfies retention policy and permits safe legacy redirects.

**Alternatives considered**: Hard-delete link data (rejected by retention
policy); convert link pages to native copies (rejected: duplicate content).

## D7 — A legacy link redirects only after fresh public eligibility

**Decision**: Canonical native content wins at a former link path. Otherwise a
legacy record redirects only after loading the retained target and checking its
current publication and visibility through the public-read resolver. Failure
returns indistinguishable not-found.

**Rationale**: Redirects must not become an oracle for restricted target
existence, title, path, or state. Fresh checking also revokes legacy access as
soon as target visibility changes.

**Alternatives considered**: Permanent redirect (rejected: publication can be
revoked); render target content at the old route (rejected: duplicate document).

## D8 — Static-site publishing remains explicitly separate

**Decision**: Keep feature 031 static-site eligibility unchanged: only public
Wiki-space pages enter its separately published artifact. Feature 032 removes
retired link placeholders but does not make public raw/generated pages static.

**Rationale**: Direct app sharing is reversible per-page visibility. Mirroring
raw evidence or generated work into an indexable external artifact is a
separate publication act with a deliberately stricter policy.

**Alternatives considered**: Make every live public page static-site eligible
(rejected: changes a separate published-artifact contract without request).

## D9 — Canonical URLs are server-resolved data, not client constants

**Decision**: Add a shared server resolver and project canonical URLs into page,
search, citation, and API/MCP results. Clients consume resolved route data or a
supplied route map; they do not derive URLs from a closed space union.

**Rationale**: `getSpaceHref` hard-codes `/spaces/raw` and
`/spaces/generated` in more than forty production call sites. A server-owned
resolver keeps configuration, aliases, cache invalidation, citations, and
notifications consistent.

**Alternatives considered**: Per-component prefix lookups (rejected: drift
and stale URLs).

## D10 — Original raw bytes stay protected

**Decision**: Public raw-page rendering exposes only its safe published page
representation. Original-byte download, source metadata, audit records, and
provenance remain permission-checked protected resources.

**Rationale**: Making an evidence page readable must not make attachments or
captured sources downloadable. The existing asset service has its own boundary.

**Alternatives considered**: Expose all referenced raw assets when a page is
public (rejected: disclosure risk and contrary to FR-013).

## D11 — Writing-mode migration preserves Wiki URLs and safely redirects moved pages

**Decision**: Every enabled space has a non-empty prefix. The Wiki prefix is
stable across writing modes. On LLM Wiki-to-Copilot migration, raw/generated
pages retain their source-space directory below the Wiki root (for example,
"/g/concepts/x" becomes "/w/generated/concepts/x"). The migration records a
page-route redirect from the old canonical URL to the new one; it redirects only
after freshly confirming that the migrated target remains public and published.
Raw/generated prefix settings remain stored while those spaces are inactive.

**Rationale**: A default empty prefix would overlap both space prefixes and
locale-first paths, forcing global path reservations and creating migration
hazards. Keeping Wiki rooted at a stable non-empty prefix avoids that ambiguity.
A route redirect preserves safe shared links without making a mode transition an
oracle for private migrated content.

**Alternatives considered**: Make Wiki root-prefix-less (rejected: ambiguous
"/g/..." and "/zh/..." routing); leave old generated/raw URLs permanently
live (rejected: two canonical URLs and a stale access path).
