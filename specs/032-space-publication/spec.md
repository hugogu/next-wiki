# Feature Specification: Configurable Space Publication

**Feature Branch**: `codex/032-space-publication`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Make wiki, generated, and raw content spaces equivalent; allow generated pages to be publicly visible through their own configured route; remove link pages and all related publishing, search, and reader behavior; provide an admin configuration page for spaces and their URL path names."

**Depends on**: 022-llm-wiki-mode (content spaces, provenance, and writing modes), 012-anonymous-page-caching (public reader delivery), 007-public-wiki-api (external page contract), 031-static-site-publishing (static public output).

## Summary

The three content spaces — wiki, generated, and raw — become peer content
locations rather than a public wiki plus two special-purpose locations that
must be bridged through a separate link page. Every enabled space has an
administrator-configured display name and canonical URL path prefix. Every
page has its own anonymous-read visibility, so an Administrator can publish a
reviewed generated page directly at that page's canonical generated-space URL.

The former `Publish as link` workflow and the link-page content type are
removed. Existing link pages are retired without destroying their audit and
revision history. Reading, searching, navigation, public delivery, API, and
AI-client surfaces operate on actual pages only; none silently dereferences a
link page into another space.

Space equality applies to identity, navigation, canonical URLs, page-level
visibility, and read/search behavior. It does not remove deliberate content
rules: raw entries remain append-only and generated pages retain their format
and provenance rules.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish a Reviewed Page from Any Space (Priority: P1)

As an Administrator, I want to make a published page externally readable from
its own space, so that I can share a reviewed generated page directly without
creating another page or choosing a second path.

**Why this priority**: This replaces the current workaround and establishes a
single source of truth for all externally shared generated content.

**Independent Test**: Publish a generated page, mark it public, open its
canonical URL in an anonymous browser, then change it back to restricted and
verify that the same URL no longer reveals it.

**Acceptance Scenarios**:

1. **Given** a published, restricted generated page, **When** an Administrator
   marks it publicly readable, **Then** an anonymous visitor can read its
   currently published revision at the page's own canonical URL.
2. **Given** a public page has an unpublished draft, **When** an anonymous
   visitor reads the page, **Then** the visitor sees only the last published
   revision and no draft status, draft content, provenance restricted to
   Administrators, or editing controls.
3. **Given** a public page in any enabled space, **When** an Administrator
   changes it back to restricted, unpublishes it, deletes it, or changes its
   path, **Then** anonymous access and shared links promptly reflect that
   change without exposing stale content.
4. **Given** a restricted page in raw, generated, or wiki, **When** an
   anonymous visitor, unauthenticated integration, or unauthorized user tries
   to read it, **Then** the page and its protected metadata are not disclosed.
5. **Given** a newly created page, **When** no page-specific visibility is
   selected, **Then** it receives the configured default for its space;
   existing Wiki pages retain their current public behavior and existing raw
   and generated pages retain their current restricted behavior.

---

### User Story 2 - Configure and Navigate Peer Spaces (Priority: P1)

As an Administrator, I want one configuration page where I can inspect each
enabled space and choose its display name, URL path prefix, and default page
visibility, so that public and authenticated URLs are concise, meaningful, and
stable for my knowledge-base structure.

**Why this priority**: Direct publication only remains understandable when a
space has a clearly owned, configurable canonical route rather than an
application-imposed generated/raw URL.

**Independent Test**: Change the generated space's display name and path
prefix, save the configuration, navigate to an existing generated page via
the new URL, and confirm the old URL safely redirects to the new canonical
address.

**Acceptance Scenarios**:

1. **Given** LLM Wiki mode is enabled, **When** an Administrator opens Space
   settings, **Then** the page presents the wiki, generated, and raw spaces
   together with their purpose, display name, canonical URL path prefix, and
   default page visibility.
2. **Given** a proposed space URL path prefix is empty where a prefix is
   required, malformed, reserved, duplicates another space, or conflicts with
   an existing canonical content route, **When** the Administrator tries to
   save it, **Then** the change is rejected with an actionable explanation and
   the existing configuration remains intact.
3. **Given** an Administrator changes a space display name or valid URL path
   prefix, **When** the change is saved, **Then** navigation, breadcrumbs,
   page URLs, shared links, search-result links, and page-management links use
   the new canonical value; previously issued space URLs redirect to the
   canonical URL without serving a second copy of the page.
4. **Given** an ordinary user or external client, **When** it attempts to
   change a space's configuration, **Then** the attempt is refused and no
   configuration is revealed beyond what is already safely public.
5. **Given** Copilot mode is active, **When** an Administrator opens Space
   settings, **Then** the active Wiki space remains configurable while raw and
   generated configuration is unavailable until LLM Wiki mode is enabled.

---

### User Story 3 - Use One Page Model Without Link Pages (Priority: P1)

As an Administrator, I want the old link-page publishing mechanism completely
removed, so that each result, reader view, revision history, and URL refers to
one actual page rather than an indirection into another space.

**Why this priority**: Removing link pages avoids duplicate identities,
path-collision rules, and surprising behavior when the generated source page
is moved, updated, searched, or deleted.

**Independent Test**: Upgrade an instance containing both native and link
pages, verify a retirement report distinguishes them, and confirm all page
views and searches return only native pages while retained historical records
remain auditable.

**Acceptance Scenarios**:

1. **Given** an instance contains existing link pages, **When** this feature
   is activated, **Then** each link page is retired from active content,
   navigation, public delivery, search, and normal page-management views while
   its historical revisions and audit trail are retained according to the
   existing soft-deletion policy.
2. **Given** a retired link page's former URL is requested, **When** its former
   target is currently public, **Then** the visitor is redirected to the
   target's canonical page URL; otherwise the URL reveals neither source nor
   target content.
3. **Given** a user opens a page, revision, comparison, export, API result, or
   AI-client result after the transition, **When** the resource is available,
   **Then** it describes and renders that page's own content only and never
   substitutes a page from another space.
4. **Given** a client tries to create, retarget, publish, or query a link page
   using a formerly supported control or integration input, **When** the
   request is made, **Then** it receives a clear unsupported-operation result
   and no link page is created or changed.
5. **Given** an Administrator views a generated page, **When** they look for
   publication actions, **Then** the `Publish as link` action and path/title
   dialog are absent; page visibility is managed on the page itself.

---

### User Story 4 - Search and Read Across Spaces Consistently (Priority: P2)

As a permitted reader or AI client, I want search results and page links to
identify the page's real space and canonical URL, so that I can open the exact
content I was permitted to find without link-target surprises.

**Why this priority**: Publication and route changes are only reliable if
every discovery surface agrees on the identity and visibility of a page.

**Independent Test**: Search for public and restricted pages in each space as
an anonymous visitor, a regular signed-in reader, an Administrator, and a
scoped AI client; verify each result set and result URL match the caller's
permissions and the configured space paths.

**Acceptance Scenarios**:

1. **Given** pages with different visibility settings across enabled spaces,
   **When** a person or AI client searches or lists pages, **Then** it receives
   only pages it can read, each result identifies its actual space and links to
   its canonical configured URL.
2. **Given** a public page in a non-Wiki space, **When** an anonymous visitor
   uses public search or follows a direct public link, **Then** only the
   public, published representation and safe page metadata are available.
3. **Given** a page has restricted source metadata, raw source bytes, audit
   detail, or provenance detail, **When** it is publicly readable, **Then**
   that protected information remains absent from public search results and
   reader pages unless it is explicitly part of the published page body.
4. **Given** an authorized reader switches among enabled spaces, **When** they
   use navigation, breadcrumbs, browser history, a bookmarked URL, or a
   search-result link, **Then** each route resolves to the same canonical page
   and space without requiring a separate link-page route.

### Edge Cases

- A visibility change is requested for a draft, deleted, or otherwise
  unpublished page: it may be saved as its future visibility setting, but it
  must not make any revision anonymously readable before normal publication.
- A configured path prefix is later claimed by a content route, or a content
  path would collide with a configured prefix: the conflicting content or
  configuration change is rejected before either canonical URL becomes
  ambiguous.
- A public page is moved between spaces or a space prefix is changed while
  public readers are using prior links: the prior URL either redirects to the
  one current canonical public URL or ceases access; it must never render a
  stale duplicate.
- A retired link page points to a missing, deleted, unpublished, or restricted
  target: its former URL must not disclose target existence, title, path, or
  content.
- A raw page is made public: its append-only rule and protected source-asset
  policy continue to apply; the public view exposes only assets explicitly
  permitted by the page's public representation.
- An instance has no link pages: activation performs no content retirement and
  all normal page history remains unchanged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST treat wiki, generated, and raw as peer enabled
  spaces for page identity, route generation, navigation, page-level anonymous
  visibility, read operations, and search-result addressing.
- **FR-002**: The system MUST retain intentional per-space authoring rules,
  including raw append-only behavior and generated-content format/provenance
  requirements; peer treatment MUST NOT weaken those rules.
- **FR-003**: Each page MUST retain an explicit anonymous-read visibility
  setting independent from its space identity. A page is anonymously readable
  only when both its visibility is public and it has a currently published
  revision.
- **FR-004**: Administrators MUST be able to view and change a page's
  anonymous-read visibility. The control MUST state the current setting and
  warn before an unpublished or previously restricted page becomes public.
- **FR-005**: Each enabled space MUST have Administrator-configurable display
  name, canonical URL path prefix, and default visibility for newly created
  pages. Space identity and its deliberate content rules are not renamed or
  removed by these presentation settings.
- **FR-006**: Space path prefixes MUST be globally unambiguous, valid for
  human-readable URLs, and protected from reserved-route and content-route
  collisions. Every public or authenticated page MUST have one canonical URL.
- **FR-007**: A saved space-prefix change MUST update all generated links and
  routes to the new canonical URL. Legacy URLs MUST redirect where doing so
  does not reveal protected content; they MUST not remain parallel reader
  endpoints.
- **FR-008**: The system MUST remove link pages as an active page kind and
  remove the `Publish as link` control, its dialog, link-target indicators,
  link-target routing, and link-specific creation, retargeting, move, export,
  and cache behavior.
- **FR-009**: During activation, the system MUST retire existing link pages
  through the normal non-destructive deletion mechanism and retain their
  revision/audit history. It MUST provide Administrators a completion report
  containing the count of retired links and their disposition.
- **FR-010**: A former link URL MUST redirect only to a currently public target
  page's canonical URL. In every other case it MUST behave as unavailable
  without disclosing the target.
- **FR-011**: Page reader, revision, comparison, navigation, export, list,
  search, public integration, and AI-client surfaces MUST operate on real page
  content only; no surface may dereference, create, expose, or depend on link
  target information after activation.
- **FR-012**: All search and listing surfaces MUST apply the same page and
  space visibility rules as direct reads, return configured canonical URLs,
  and omit pages or metadata not readable by the caller.
- **FR-013**: Publicly readable non-Wiki pages MUST expose only the published
  body and metadata designated safe for public readers. Authenticated-only
  controls, draft state, raw source material, audit data, and restricted
  provenance MUST remain protected.
- **FR-014**: Existing Wiki pages, generated pages, and raw pages MUST retain
  their current visibility after activation unless an Administrator explicitly
  changes it. New-page defaults preserve current behavior: Wiki public; raw
  and generated restricted.
- **FR-015**: Only Administrators may configure a space, alter public
  visibility, activate the link-retirement transition, or receive its detailed
  report. Every such action MUST be auditable.
- **FR-016**: The external page and AI-client contracts MUST remove link-page
  creation and target fields, document page visibility and configured canonical
  URLs, and provide a clear migration outcome for callers using the retired
  link-page behavior.
- **FR-017**: A writing-mode switch MUST preserve the Wiki space's configured
  canonical prefix. When raw or generated pages migrate into Wiki while
  switching to Copilot mode, their destination paths MUST retain a
  source-space directory, and their former canonical routes MUST redirect only
  while the migrated target is currently public and published; otherwise the
  former route MUST be unavailable without disclosing the target.

### Public Content Delivery

- The feature adds public, published page representations for any enabled
  space whose page visibility is public. Their body, safe metadata, canonical
  URL, and allowed public navigation are anonymously readable content; draft,
  restricted, and personal controls are not.
- Each public page retains a static or incrementally regenerated representation
  at exactly one configured canonical URL. Its source space, page publication,
  visibility, path, title, safe metadata, deletion state, and space path-prefix
  configuration are all public-content invalidation events.
- Retiring a link page invalidates its former public route. When a safe redirect
  is available, the route redirects to the target's sole canonical public URL;
  otherwise it becomes unavailable. No linked content remains in public
  navigation, sitemaps, or cached public reader documents.
- Public page visibility alone does not add a page to global navigation,
  home-page lists, or search-engine discovery. Direct sharing is supported;
  broader public curation remains a separate decision.

### Key Entities

- **Content Space**: An enabled logical location for pages (wiki, generated,
  or raw), with fixed content rules and configurable display name, URL path
  prefix, and new-page visibility default.
- **Page Visibility**: The explicit public or restricted anonymous-read state
  of one page. It takes effect for public access only while the page has a
  published revision.
- **Canonical Space URL**: The single shareable route composed from a space's
  configured prefix and a page path, used by reader, search, navigation, and
  integrations.
- **Retired Link Record**: Historical page and revision/audit data for a former
  link page, excluded from active content and retained only for audit,
  restoration policy, and safe legacy-route handling.
- **Space Configuration**: Administrator-owned settings that define a space's
  display label, canonical URL prefix, and default page visibility without
  altering the space's identity or editorial constraints.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In acceptance tests, 100% of public pages in all enabled spaces
  are readable anonymously only at their configured canonical URL and show the
  current published revision, while 100% of restricted, draft, and deleted
  pages disclose no protected body or metadata.
- **SC-002**: An Administrator can change a page's public visibility or a
  space's display name/path prefix and verify the resulting canonical link in
  under two minutes without creating a second page.
- **SC-003**: In a mixed set of public and restricted pages across all enabled
  spaces, 100% of direct-read, list, search, and AI-client checks return the
  same permission-allowed page set and canonical links for a given caller.
- **SC-004**: After activation, 100% of legacy link pages are absent from
  active reader, search, navigation, export, and management surfaces, while
  100% retain auditable historical records and no legacy route reveals a
  non-public target.
- **SC-005**: In browser navigation checks, 100% of changed-prefix links,
  bookmarks, and legacy link URLs resolve either to the one permitted canonical
  destination or to an unavailable result; none render a duplicate public
  document.

## Assumptions

- This feature applies to the existing LLM Wiki mode. Copilot mode continues
  to expose only its active Wiki space; raw and generated settings become
  available when that mode is enabled.
- The three built-in space identities remain fixed. Administrators configure
  human-facing display labels and URL path prefixes, not new arbitrary space
  types or the removal of built-in editorial rules.
- The Wiki space retains its established public default, while generated and
  raw retain their restricted defaults. Administrators may override each
  individual page and may change future defaults deliberately.
- A page's canonical space URL is the only supported public sharing URL. This
  release does not add unguessable, time-limited, password-protected, or
  recipient-specific share links.
- Public pages remain directly shareable but are not automatically promoted to
  global public navigation, home-page listings, or search-engine feeds.
- Existing link data is retired rather than hard-deleted, in keeping with
  version and audit retention requirements. A later restoration policy, if
  needed, is out of scope.
- Changing a route prefix should preserve safe inbound links through redirects;
  operators are responsible for choosing meaningful stable prefixes and must
  resolve any path conflicts before saving.
- Every enabled space has a non-empty canonical prefix. The Wiki prefix remains
  stable across writing-mode changes; raw and generated prefix settings are
  retained while inactive and reused when LLM Wiki mode is enabled again.
- Switching from LLM Wiki to Copilot keeps the existing non-destructive content
  migration: raw and generated pages move into Wiki below source-space path
  segments. A safe legacy route redirect preserves previously shared public
  addresses only while the migrated page remains public and published.
