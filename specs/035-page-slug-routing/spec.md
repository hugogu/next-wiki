# Feature Specification: Page Slug Routing

**Feature Branch**: `035-page-slug-routing`

**Created**: 2026-08-20

**Status**: Draft

**Input**: User description: "为了解耦知识库的目录结构与url中的path，并为了能支持多个alias路径对同一个页面的访问，同时为了支持页面slug变更后，原slug或url可自动跳转以保护SEO。引入页面slug这个概念，用于表达其在url中的路径。这个概念在wiki.js中应该也是存在的。内容页的url一旦发布，终身不变。由于slug和目录结构可能冲突，需要在设计时考虑到如何规避冲突。slug考虑支持多层级，但是不要和目录冲突。内置的关键字不得用于slug，从wiki.js导入的页面，也需要同步设置好slug，默认与path一致即可。"

## Summary

Today a page's public web address is its position in the knowledge tree: move a
page into a different folder and its URL changes, breaking every existing link,
bookmark, and search-engine result that pointed at it. This feature separates
the two concerns by giving every page its own **slug** — the address the page
occupies on the public web — while the tree path keeps its job of describing
where the page *lives* for organizing, browsing, permissions, import, and
export.

Once a page has been published at an address, that address keeps working for
the life of the wiki. Reorganizing the tree changes nothing publicly. Changing
a page's slug retires the previous address into a permanent alias that
automatically forwards readers and crawlers to the current one, so accumulated
search ranking and inbound links survive the rename. An author or administrator
may also register additional alias addresses for a page, so one page can be
reached through several memorable addresses while still having exactly one
canonical address.

Because slugs and tree paths would otherwise compete for the same public
address space, the system owns a single, authoritative address namespace: every
canonical slug, every retired or manually added alias, every address that was
ever publicly reachable through the old tree-path scheme, and every address
reserved by built-in application functionality live in it together. Any new or
changed slug or alias is validated against that whole namespace before it is
accepted, so a new address can never silently steal or shadow an address that
some reader, bookmark, or crawler already depends on.

Existing content and content imported from Wiki.js are given a slug equal to
their tree path, so upgrading the wiki or importing an external wiki changes no
public address at all.

## Clarifications

### Session 2026-08-20

- Q: When a page is created in next-wiki (not imported), what shape should the automatically generated default slug have? → A: The page's full tree path, matching the Wiki.js import default.
- Q: What happens when a reader requests a non-canonical address (a manually added alias or a slug retained after a rename)? → A: Every non-canonical address permanently forwards to the canonical address; no alias renders content in place.
- Q: Which characters may a slug contain? → A: Exactly the character set today's page paths allow (lowercase letters, digits, hyphen, underscore, level separator); no Unicode or non-ASCII slugs.
- Q: What happens to a soft-deleted page's canonical address and aliases? → A: They stay owned by that page and unavailable to any other page; only an explicit administrative release frees them, and restoring the page restores its addresses intact.
- Q: Which permission governs changing a slug and managing aliases? → A: Page write permission for changing the slug and for adding or removing a manually added alias; space-manage permission for the two irreversible actions — removing an automatically retained alias, and releasing a deleted page's addresses.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A page's public address survives any reorganization (Priority: P1)

A knowledge-base owner has published `/wiki/getting-started/install`. Months
later they restructure the tree and move that page under a new
`operations/onboarding` folder because that is where it belongs
organizationally. Readers, bookmarks, chat links, and search results that point
at the original address continue to open the page exactly as before — the move
is invisible on the public web.

**Why this priority**: This is the core promise of the feature and the reason
the concept exists. Without it, nothing else in the feature has value. It also
covers the upgrade path: every page that already exists must come out of this
change with an address identical to the one it has today.

**Independent Test**: Publish a page, note its address, move it to a completely
different branch of the tree, then visit the original address. The page renders
and its address bar still shows the original address. Verified as a full slice
even if slug editing, aliases, and import alignment are not yet built.

**Acceptance Scenarios**:

1. **Given** a published page whose tree path is `getting-started/install`,
   **When** an editor moves it to `operations/onboarding/install`, **Then**
   visiting the page's original public address still returns the page content
   with a success response, and the page's canonical address is unchanged.
2. **Given** an existing wiki upgraded to this feature, **When** any previously
   published page is requested at the address it had before the upgrade,
   **Then** the page is returned and the address is unchanged — no redirect, no
   not-found.
3. **Given** a page moved in the tree, **When** an editor views the page tree
   and breadcrumbs, **Then** the tree and breadcrumbs reflect the new
   organizational location while the public address stays the same.
4. **Given** a newly created page at tree path `guides/deployment/k8s`, **When**
   no slug is supplied by the author, **Then** the system assigns the slug
   `guides/deployment/k8s` and shows it to the author before saving.

---

### User Story 2 - Changing an address never breaks the old one (Priority: P2)

An author decides that `/wiki/faq` is a better public address than
`/wiki/support/frequently-asked-questions`. They change the page's slug. Every
visitor and crawler arriving at the previous address is permanently forwarded
to the new one, and the page's search-engine identity moves with it instead of
being lost.

**Why this priority**: This is the SEO-protection half of the request, and it
is what makes slugs safe to edit. It depends on US1 existing but delivers
independent, demonstrable value.

**Independent Test**: Change a published page's slug, then request the previous
address. The response permanently forwards to the new address, and the page
renders there. Repeat the rename a second time and confirm the oldest address
still reaches the page in a single forward.

**Acceptance Scenarios**:

1. **Given** a published page with slug `support/frequently-asked-questions`,
   **When** an editor changes the slug to `faq`, **Then** requesting the
   previous address permanently forwards to `/wiki/faq` and the page renders
   there.
2. **Given** a page whose slug has been changed twice (A → B → C), **When** a
   reader requests address A, **Then** they arrive at address C through a
   single permanent forward, never through a chain of forwards and never in a
   loop.
3. **Given** a published page, **When** its slug is changed, **Then** the page's
   declared canonical address (as seen by search engines) is the new address
   and every retired address declares the same canonical address.
4. **Given** a page whose slug was changed, **When** anyone attempts to assign
   that retired address to a different page, **Then** the attempt is rejected
   with an explanation naming the conflict.
5. **Given** a page that has never been published, **When** its slug is changed,
   **Then** no permanent alias is retained for the discarded slug (a
   never-public address has no audience to protect) and the discarded slug
   becomes available again.

---

### User Story 3 - The system refuses addresses that would collide (Priority: P3)

An editor tries to give a page the slug `admin`, then `zh/tutorial`, then an
address that another page already publishes at. Each attempt is rejected before
saving, with a message that says exactly which rule was violated and what to do
instead. A valid multi-level slug such as `guides/deployment/kubernetes` is
accepted even though no folder of that shape exists in the tree.

**Why this priority**: Conflict protection is what makes the permanent-address
guarantee real rather than aspirational. It must exist before authors are
allowed to edit slugs freely at scale, but it can be specified, built, and
tested as a standalone guardrail.

**Independent Test**: Attempt to save each class of forbidden slug and confirm
each is rejected with a distinct, actionable message; then confirm a legitimate
multi-level slug saves successfully.

**Acceptance Scenarios**:

1. **Given** any page, **When** an editor submits a slug whose first segment is
   reserved by built-in application functionality (for example the segments
   used for administration, authentication, editing, search, the public API, or
   health endpoints), **Then** the save is rejected with a message identifying
   the reserved word.
2. **Given** any page, **When** an editor submits a slug whose first segment
   would be interpreted as a language code, **Then** the save is rejected,
   because that position is reserved for translated addresses.
3. **Given** a page already published at address X in a space, **When** an
   editor submits slug X for a different page in the same space, **Then** the
   save is rejected and names the page currently holding that address.
4. **Given** an address that was publicly reachable under the previous
   tree-path scheme, **When** an editor submits that address as a slug for a
   different page, **Then** the save is rejected, because a reader's existing
   link to that address must not be silently redirected to unrelated content.
5. **Given** pages `guides/deployment` and `guides/deployment/kubernetes`,
   **When** both are saved, **Then** both are accepted and each resolves to its
   own page — a multi-level slug does not require or create a folder, and one
   slug being a prefix of another is not a conflict.
6. **Given** two different spaces, **When** a page in each is given the same
   slug, **Then** both are accepted, because each space owns its own address
   space under its own public prefix.
7. **Given** an invalid slug (empty, leading/trailing separator, repeated
   separators, disallowed characters, or over the length limit), **When** it is
   submitted, **Then** the save is rejected with a message describing the
   allowed form.

---

### User Story 4 - One page, several addresses (Priority: P4)

An owner wants their release-notes page reachable at a short campaign address
in addition to its normal address. They add an alias, and both addresses now
lead readers to the page, with one of them clearly designated as canonical.
Later they remove the campaign alias and that address stops resolving.

**Why this priority**: This is a convenience capability requested explicitly,
but the wiki is fully usable without it; the automatic aliases from US2 already
cover the link-preservation need.

**Independent Test**: Add a manual alias to a page, visit it, confirm the reader
arrives at the page. Remove the alias and confirm the address no longer
resolves.

**Acceptance Scenarios**:

1. **Given** a published page, **When** an owner adds an additional alias
   address, **Then** requesting that alias leads the reader to the page and the
   page's canonical address remains unchanged.
2. **Given** a page with several aliases, **When** an owner views the page's
   properties, **Then** all of its addresses are listed, each labeled as
   canonical, manually added, or automatically retained from a previous slug.
3. **Given** a manually added alias, **When** an owner removes it, **Then** the
   address stops resolving to the page and becomes available for reuse.
4. **Given** an automatically retained address from a previous slug, **When** a
   user with only page write permission attempts to remove it, **Then** the
   action is unavailable to them; **When** a user with space-manage permission
   attempts it, **Then** the system warns that removing it will break existing
   public links and requires an explicit confirmation before proceeding.
5. **Given** an alias address, **When** it is submitted, **Then** it is
   validated against exactly the same conflict and reserved-word rules as a
   canonical slug.
6. **Given** a reader without permission to read the target page, **When** they
   request an alias of that page, **Then** they receive the same response they
   would receive by requesting the page directly, revealing neither the page's
   existence nor its canonical address.

---

### User Story 5 - Imported and migrated content arrives with correct addresses (Priority: P5)

An owner imports a Wiki.js instance. Every imported page arrives with a slug
equal to its Wiki.js path, so every link that previously worked against the old
Wiki.js site works against next-wiki without a manual mapping step. The same
holds for content brought in through archive import and cross-space migration.

**Why this priority**: Import fidelity matters most to owners migrating an
existing site, which is a smaller audience than the everyday authoring flows,
but the failure mode (a wholesale loss of inbound links) is severe.

**Independent Test**: Run a Wiki.js import against a source with nested paths
and confirm each created page's public address equals its source path, then
request several of those addresses.

**Acceptance Scenarios**:

1. **Given** a Wiki.js source with pages at nested paths, **When** an import
   runs, **Then** every created page has a slug equal to its source path and is
   reachable at that address.
2. **Given** a Wiki.js source page whose path collides with a reserved word, is
   already taken in the destination space, or contains characters a slug may not
   contain, **When** the import runs, **Then** that page is still imported with a
   deterministic, rule-conforming, non-colliding address, the adjustment and its
   reason are reported in the import result, and no other page's address is
   changed.
3. **Given** an import preview, **When** an owner reviews it before running,
   **Then** the preview shows the public address each page will receive and
   flags any address conflict.
4. **Given** a page migrated between spaces, **When** the migration completes,
   **Then** its address in the destination space is recorded and its previous
   public address permanently forwards to the new one.
5. **Given** an export followed by a re-import, **When** the round trip
   completes, **Then** each page's slug and its retained alias addresses are
   preserved.

---

### Edge Cases

- **Prefix relationships**: `guides/deployment` and
  `guides/deployment/kubernetes` are separate pages with separate addresses;
  neither shadows the other and neither implies a folder.
- **Slug matches an unrelated page's tree path**: rejected while that page's
  legacy tree-path address is still guaranteed reachable.
- **Address freed by deletion**: a soft-deleted page keeps ownership of its
  addresses; they do not become available for another page, and they do not
  silently start resolving to different content. Releasing them requires an
  explicit administrative action.
- **Alias equal to its own page's canonical slug**: rejected, since it would
  describe a self-forward.
- **Alias pointing at a page that is later deleted or unpublished**: the alias
  behaves exactly as a direct request for that page would — same not-found or
  forbidden response, no leak of the target's existence.
- **Translated pages**: a translation is reached under its language segment
  ahead of the page's slug; changing the source page's slug moves every
  translation's address with it and retains the previous translated addresses
  too.
- **Case, trailing separators, and percent-encoding**: uppercase and non-ASCII
  input is rejected when a slug or alias is *written*, but an incoming *request*
  that differs from a stored address only by case, a trailing separator, or
  encoding still reaches the page and settles on the canonical written form.
- **Space public prefix changes**: an address is always interpreted relative to
  its space's current public prefix, and existing space-prefix aliases keep
  working in combination with page slugs and page aliases.
- **Redirect chains and cycles**: any chain is collapsed to its final target
  when the address is written; a change that would create a cycle is rejected.
- **Very deep or very long slugs**: rejected beyond a stated limit with a
  message giving the limit.
- **Two pages that both want a slug in the same request** (batch create,
  import): the batch is resolved deterministically and reports which entries
  were adjusted, without partially applying conflicting addresses.
- **Pages that render another page's content** (link pages) and pages in the
  raw and generated spaces: they participate in the same address namespace and
  the same conflict rules as ordinary pages.
- **Published static site**: the generated static site reflects the current
  canonical address of every eligible page and preserves every retained alias
  as a forwarding entry, so a statically hosted copy honors the same permanent
  address guarantee.

## Requirements *(mandatory)*

### Functional Requirements

#### Address model

- **FR-001**: Every non-translation page MUST have exactly one canonical public
  address (its slug) that determines where readers, links, and search engines
  find it. A translation has exactly one canonical public address composed from
  its locale and its source page's slug; translations do not own independent
  slugs.
- **FR-002**: A page's tree path MUST remain the organizational location used
  for the page tree, breadcrumbs, permission inheritance, import, and export,
  and MUST NOT determine the page's public address once the page has a slug.
- **FR-003**: A slug MUST support multiple levels separated by the same
  separator used in the public address, and a multi-level slug MUST NOT require,
  create, or imply any corresponding folder in the page tree.
- **FR-004**: When an author does not supply a slug, the system MUST assign the
  page's full tree path as its slug at creation time — the same default the
  Wiki.js import uses — and MUST show that slug to the author before the page
  is saved. The default is captured once at creation; a later tree move does
  not re-derive it.
- **FR-005**: Slugs MUST be unique within a space; identical slugs in different
  spaces MUST be permitted because each space carries its own public prefix.
- **FR-006**: A slug MUST accept exactly the character set today's page paths
  allow — lowercase letters, digits, hyphens, underscores, and the level
  separator — and MUST reject non-ASCII and uppercase input rather than
  transliterating or down-casing it. A slug MUST be rejected when empty, over
  the stated maximum length, or malformed (leading, trailing, or repeated
  separators).

#### Permanence and redirection

- **FR-007**: Once a page has been published at an address, that address MUST
  remain resolvable for the life of the wiki and MUST never return not-found
  because of a later slug change, tree move, space move, or reorganization.
  The only exceptions are an explicit, authorized breaking action that removes
  a retained alias or releases a deleted page's addresses under FR-014a and
  FR-022; that action must warn the operator before it takes effect.
- **FR-008**: Changing the slug of a page that has been published MUST
  automatically retain the previous address as a permanent alias of that page.
- **FR-009**: Requesting any non-canonical address of a page — a retained
  address from a previous slug or a manually added alias alike — MUST
  permanently forward the requester to that page's canonical address in a
  single hop, with no intermediate hops even after repeated renames. No address
  other than the canonical one renders page content in place.
- **FR-010**: Moving a page within the tree, or between spaces, MUST NOT change
  its canonical address unless an editor explicitly changes the slug; where a
  space move necessarily changes the public prefix, the previous full address
  MUST be retained as a permanent alias.
- **FR-011**: Every reader-facing page response MUST declare exactly one
  canonical address for the page, and every alias of that page MUST declare the
  same canonical address.
- **FR-012**: Discarding a slug on a page that has never been published MUST
  NOT retain an alias, and MUST return that address to the available pool.

#### Conflict avoidance

- **FR-013**: The system MUST maintain a single authoritative address namespace
  per space containing: canonical slugs, retained aliases from previous slugs,
  manually added aliases, and every address that was publicly reachable under
  the pre-feature tree-path scheme.
- **FR-014**: Every slug or alias write MUST be validated against that entire
  namespace and MUST be rejected when it would take over an address already
  owned by another page, including a soft-deleted page.
- **FR-014a**: A soft-deleted page MUST keep ownership of its canonical address
  and every alias. Those addresses MUST return the same not-found response a
  reader would get for any missing page, MUST NOT become available to another
  page, and MUST be restored intact when the page is restored. Only an explicit
  administrative release action MAY return them to the available pool, and that
  action MUST state that existing public links to those addresses will
  afterwards resolve to whatever page next claims them.
- **FR-015**: The system MUST reject any slug or alias whose leading segment is
  reserved by built-in application functionality, and the reserved set MUST be
  derived from the application's actual routes rather than a separately
  maintained list, so adding a built-in route automatically protects its
  address.
- **FR-016**: The system MUST reject any slug or alias whose leading segment
  would be interpreted as a language code, because that position addresses
  translations.
- **FR-017**: A slug that is a prefix of another slug, or that contains another
  slug as a prefix, MUST NOT be treated as a conflict.
- **FR-018**: Every rejection MUST state which rule was violated and, where a
  conflicting page exists and the requester is permitted to know of it, identify
  that page; where the requester is not permitted to know of it, the message
  MUST NOT reveal the conflicting page's existence.
- **FR-019**: Conflict validation MUST be applied identically at every write
  path: the web editor, page creation, page properties, batch creation, import,
  cross-space migration, the public content API, and MCP tooling.

#### Aliases

- **FR-020**: An owner MUST be able to add one or more additional alias
  addresses to a page and MUST be able to see all of a page's addresses, each
  labeled as canonical, manually added, or automatically retained.
- **FR-021**: An owner MUST be able to remove a manually added alias, which
  returns that address to the available pool.
- **FR-022**: Removing an automatically retained alias MUST require an explicit
  confirmation that states the consequence for existing public links.
- **FR-022a**: Changing a page's slug and adding or removing a manually added
  alias MUST require the same write permission that already governs editing the
  page's properties. Removing an automatically retained alias, and releasing a
  deleted page's addresses, MUST additionally require space-manage permission,
  because those two actions are the only ones that can break an address a
  reader already holds. In a single-owner deployment the owner satisfies both
  levels with no configuration.
- **FR-023**: Resolving an alias MUST enforce the same read permission as a
  direct request for the target page, and an unauthorized requester MUST receive
  the same response as a direct request — never a redirect, a canonical address,
  or any other signal that the target exists.

#### Migration and interoperability

- **FR-024**: Every non-translation page that exists when this feature is
  deployed MUST receive a slug equal to its current public address. Translation
  rows retain no independent slug and continue to resolve at
  `{locale}/{source-slug}`. Together, those rules ensure no public address
  changes on upgrade.
- **FR-025**: Wiki.js import MUST set each imported page's slug to its Wiki.js
  source path, and the import preview MUST show the resulting public address for
  each page.
- **FR-026**: When an imported or batch-created page's intended address cannot
  be used as-is — because it conflicts with an address already owned, uses a
  reserved leading segment, or contains characters the slug rules disallow (a
  Wiki.js path may legitimately carry uppercase or non-ASCII characters) — the
  system MUST assign a deterministic non-colliding, rule-conforming address,
  report the adjustment and its reason in the run result, and MUST NOT alter any
  existing page's address.
- **FR-027**: Export and archive import MUST carry each page's slug and its
  retained aliases so that a round trip preserves every public address.
- **FR-028**: The public content API and MCP tooling MUST expose a page's
  canonical address and its aliases, MUST allow setting the slug wherever page
  properties can be set, and MUST keep the existing page identifiers unchanged
  so current integrations continue to work.

### Public Content Delivery *(required when a feature changes anonymously readable published content)*

- The page body itself does not change. What changes is the **address** at
  which an anonymously readable published page is delivered, the canonical
  address declared in its public metadata, and the set of addresses that
  forward to it.
- Every publicly reachable address — canonical or alias — MUST have a
  cacheable representation: the canonical address serves the static/ISR
  document, and each alias serves a cacheable permanent forward. Resolving an
  address MUST NOT require a per-request database read, session lookup, cookie
  read, or request-header read for anonymously readable pages.
- Public navigation and internal links rendered into the cached document MUST
  use canonical addresses so that readers never traverse a forward when
  clicking within the wiki.
- The following mutations MUST invalidate the affected cached addresses: setting
  or changing a slug (old address and new address), adding or removing an
  alias (that address), moving a page within or between spaces (its address and
  its parents' navigation), publishing or unpublishing, deleting or restoring,
  and any change to a space's public prefix (every address under both the old
  and new prefix).
- Alias resolution MUST NOT leak the existence or address of a page the
  requester cannot read; a forbidden or missing target produces the same cached
  public response as a direct request.

### Key Entities *(include if feature involves data)*

- **Page Slug**: The canonical public address of a page within its space.
  One per page, unique within the space, possibly multi-level, independent of
  the page's tree path. Determines the address bar, the declared canonical
  address, and the address used in generated links.
- **Page Address Alias**: An additional address that resolves to a page. Carries
  its origin — automatically retained from a previous slug, or manually added —
  and the time it was created. Automatically retained aliases are permanent by
  default; manually added ones are freely removable.
- **Reserved Address Namespace**: The set of leading address segments that
  belong to built-in application functionality (administration, authentication,
  editing, search, API, health, and similar), plus segments that would be read
  as language codes, plus segments reserved by the published static site. Slugs
  and aliases may not use them.
- **Page Tree Path**: The organizational location of a page, retained as-is.
  After this feature it drives the tree, breadcrumbs, permission inheritance,
  import/export layout, and the default slug at creation — but not the public
  address.
- **Space Public Prefix**: The existing per-space leading address segment. Every
  page address is interpreted relative to it; the existing prefix-alias
  mechanism continues to apply on top of page-level slugs and aliases.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After upgrading an existing wiki, 100% of addresses that were
  publicly reachable before the upgrade remain reachable, and 0% of them change
  the address shown in the reader's address bar.
- **SC-002**: Moving any page to any other location in the tree changes 0
  public addresses.
- **SC-003**: After any number of slug changes, a reader arriving at the
  oldest published address reaches the current page in exactly one forward,
  100% of the time.
- **SC-004**: 100% of attempts to save a slug or alias that is reserved, taken,
  or malformed are rejected before the page is saved, with a message naming the
  violated rule.
- **SC-005**: Importing a Wiki.js instance produces public addresses identical
  to the source paths for 100% of pages that have no conflict, and produces a
  reported, non-colliding address for 100% of the remainder.
- **SC-006**: An owner can give a page an additional address, or change its
  address, in no more than three steps from the page itself, without leaving
  the page.
- **SC-007**: Every reader-facing page, at every one of its addresses, declares
  exactly one canonical address — verifiable as 0 pages with a missing,
  duplicated, or self-inconsistent canonical declaration.
- **SC-008**: Anonymous readers see no measurable slowdown: a request to a
  canonical address is served from the same cached representation as today, and
  a request to an alias completes within one additional round trip.
- **SC-009**: Zero addresses are ever reassigned from one page to another
  without an explicit administrative release action — verifiable by attempting
  reuse of a deleted page's address.

## Assumptions

- **The slug replaces the tree path in public addresses rather than being added
  alongside it.** The public address stays `/<space-prefix>/<slug>`, keeping
  exactly one canonical entry point per page. No new URL prefix (such as a
  dedicated slug namespace) is introduced, because two parallel public
  addresses for the same page would violate the project's single-canonical-entry
  rule.
- **"The URL never changes once published" means the published address never
  breaks.** Authors may still change a slug — the request explicitly asks for
  that — and the previous address is retained permanently. An address that has
  been public never returns not-found because of an internal change.
- **The page's existing identifiers and the tree path remain the identity used
  by the content API, MCP tooling, exports, and permissions.** The slug is
  additive: it is a public-address attribute, not a new primary key. Existing
  integrations continue to address pages the way they do today.
- **Uniqueness is scoped to a space**, since every address is already qualified
  by the space's public prefix.
- **Translations keep their current shape**: the language segment precedes the
  source page's slug. Translations do not get independent slugs in this feature;
  changing a source slug retains the previous locale-prefixed translation
  addresses as aliases too.
- **Retained aliases are not garbage-collected.** They are small, permanent
  records with no expiry or retention policy. They can be removed only by the
  explicit, authorized breaking action described in FR-022, and deleted-page
  addresses can be released only under FR-014a.
- **Vanity or short-link addresses at the site root are out of scope.** Every
  address introduced by this feature lives under a space's public prefix.
- **Per-locale slugs, per-alias analytics, and bulk address-rewriting tools are
  out of scope** for this feature.

## Dependencies

- The existing per-space public prefix and prefix-alias mechanism, which
  continues to qualify every page address.
- The existing route-derived reserved-address computation, which this feature
  extends to cover slugs and aliases rather than replacing.
- The existing page-move redirect records created by cross-space migration and
  writing-mode changes, which must be reconciled into the single address
  namespace defined here rather than kept as a parallel mechanism.
- The existing static/ISR public delivery and its invalidation points, which
  must gain the address-level invalidations listed above.
- The existing Wiki.js import, archive import/export, and cross-space migration
  flows, each of which must carry slugs and aliases.
- The project's architecture mandate that names the tree path as canonical for
  routing predates this feature and will need a governed amendment, since this
  feature makes the slug canonical for routing while the path stays canonical
  for organization, permissions, import, and export.
