# Feature Specification: Static Site Publishing

**Feature Branch**: `031-static-site-publishing`

**Created**: 2026-07-31

**Status**: Draft

**Input**: User description: "静态站点发布（Static Site Publishing to GitHub Pages）：把 wiki 内容渲染成 HTML 静态站点并发布到 GitHub Pages。与现有 git export（全量原始 Markdown 数据导出/备份）是相互独立的两个功能，不复用其产物语义。要求：(1) 产出可直接由 GitHub Pages 托管的 HTML，GitHub 侧不做构建；(2) 视觉风格与站内保持一致；(3) 尽量保留纯前端即可实现的功能（如目录树导航、面包屑、代码高亮、KaTeX、mermaid、站内搜索、深色模式、锚点跳转）；(4) 保留多语言（i18n）支持，多 locale 页面可访问与切换；(5) 只发布可公开的内容，必须遵守 pages.visibility 与 spaces.anonymousRead。"

## Summary

Give a wiki owner a way to publish a **reader-facing static website** of their
publicly readable wiki content to a static host such as GitHub Pages, so that
readers can browse the knowledge base without the wiki application being
reachable, online, or scaled for public traffic.

The published site is a **rendered presentation artifact**: ready-to-serve HTML
pages that the host serves as-is, with no build step performed by the host. It
looks and reads like the wiki's own reader experience — same design tokens,
same content rendering, same navigation tree, breadcrumbs, in-page table of
contents, code highlighting, math, diagrams, anchor links, light/dark mode —
and keeps every capability that a browser can satisfy on its own, including
full-text search across the published pages and multi-locale browsing with
language switching.

This feature is **deliberately separate from the existing Git export**. Git
export produces the canonical raw source (Markdown plus frontmatter and
assets) for backup, portability, and data ownership; its artifact is input for
other tools. Static site publishing produces a human-readable website; its
artifact is output for readers. The two have different audiences, different
correctness criteria, different content-selection rules, and different failure
consequences, so they are configured, triggered, versioned, and monitored
independently, and neither depends on the other being enabled.

Because the published site is anonymous by definition, content selection is the
feature's most important safety property: only authored wiki pages that are
already anonymously readable in the wiki may appear, and no trace of any other
page — title, path, excerpt, link, or search entry — may reach the artifact.
Raw captured evidence and AI-generated knowledge spaces are never published,
even when their visibility settings would otherwise allow it, because the site
is a reader-facing publication rather than a mirror of everything the wiki
happens to hold.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish a public reader site (Priority: P1)

As a wiki owner, I want to point the wiki at a repository branch that a static
host serves, and publish my public pages there as a browsable website, so that
readers can read my knowledge base at a public URL without touching my wiki
instance.

**Why this priority**: This is the feature. Without a working first publish
there is no site, and everything else refines an artifact that does not exist.

**Independent Test**: Configure a target with credentials, run a publish, open
the resulting public URL, and confirm the site's home page lists the published
page tree and that any published page opens and reads correctly.

**Acceptance Scenarios**:

1. **Given** an Admin opens the static site publishing settings, **When** they
   provide a target repository, branch, site base address, and credentials,
   **Then** the settings are saved, the credential is never displayed back, and
   the target can be validated before the first publish.
2. **Given** a validated target, **When** the Admin starts a publish, **Then**
   the request returns immediately and the publish proceeds as background work
   with visible status.
3. **Given** a publish completes, **When** the Admin opens the reported public
   URL, **Then** the site is served directly by the host with no build step
   performed by the host, and the home page presents the published content tree.
4. **Given** a publish completes, **When** the Admin views the publishing
   settings, **Then** they see the completion time, outcome, number of pages and
   assets published, number of pages excluded, and a link to the public site.
5. **Given** a publish fails at any stage, **When** the Admin views the status,
   **Then** the failure and its cause are shown, no credential appears in the
   message, and the previously published site remains intact and servable.

---

### User Story 2 - Publish only what is already public (Priority: P1)

As a wiki owner, I want absolute confidence that private or restricted content
cannot reach the public site, so that publishing is a safe operation rather than
a disclosure risk I must audit by hand.

**Why this priority**: A single leaked page is unrecoverable — the artifact is
public, mirrored, and indexed. This property must hold on the very first
publish, not be added later.

**Independent Test**: Create a mix of publicly readable pages, restricted pages,
pages in a space that disallows anonymous reading, and publicly readable entries
in raw-capture and generated-knowledge spaces, cross-link them, publish, and
confirm by searching the entire artifact that no excluded page's title, path,
body, excerpt, asset, or search entry exists anywhere in it.

**Acceptance Scenarios**:

1. **Given** a page is published, not deleted, marked publicly visible, and
   lives in an ordinary authored wiki space that allows anonymous reading,
   **When** a publish runs, **Then** that page appears on the site.
2. **Given** a page is restricted, unpublished, deleted, or lives in a space
   that disallows anonymous reading, **When** a publish runs, **Then** neither
   the page nor its title, path, excerpt, revision content, referenced assets,
   nor any search entry for it appears anywhere in the artifact.
3. **Given** an entry lives in a raw-capture or generated-knowledge space and is
   marked publicly visible in a space that allows anonymous reading, **When** a
   publish runs, **Then** it is still excluded from the artifact, and an Admin
   reviewing the run can see that it was withheld because of its space kind.
4. **Given** a published page links to a page that may not be published,
   **When** the site is generated, **Then** the link is rendered as plain,
   non-navigable text that reveals no target address.
5. **Given** an asset is referenced only by pages that may not be published,
   **When** a publish runs, **Then** that asset is not included in the artifact.
6. **Given** a previously published page becomes restricted, is deleted, or its
   space stops allowing anonymous reading, **When** the next publish runs,
   **Then** the page and its assets are removed from the public site and its
   address no longer serves content.
7. **Given** an Admin is about to publish, **When** they review the pending
   publish, **Then** they can see how many pages will be published and how many
   are excluded, grouped by the reason for exclusion.

---

### User Story 3 - Read the site the way readers read the wiki (Priority: P1)

As a reader, I want the public site to look and behave like the wiki's own
reading experience, so that I can navigate the page tree, follow breadcrumbs,
jump to headings, and read code, math, and diagrams without anything feeling
degraded or broken.

**Why this priority**: A published site that loses navigation or renders content
incorrectly fails its only purpose. Visual and rendering consistency is an
explicit requirement, not a polish item.

**Independent Test**: Publish a page set that exercises headings, code blocks,
math, diagrams, tables, images, and internal links, then compare each page on
the public site with the same page in the wiki reader and confirm the same
structure, same styling, and no missing or unrendered element.

**Acceptance Scenarios**:

1. **Given** a reader opens any published page, **When** the page renders,
   **Then** its content presentation matches the wiki's reader for the same
   revision, including formatted text, tables, code highlighting, mathematical
   notation, and diagrams.
2. **Given** a reader opens any published page, **When** the page renders,
   **Then** the site's colors, spacing, typography, and components come from the
   wiki's own design token and theme system rather than site-specific styling.
3. **Given** a reader is on any published page, **When** they look at the page
   frame, **Then** they can navigate the published page tree, see breadcrumbs
   reflecting the page's position, and use an in-page table of contents.
4. **Given** a reader follows or copies a heading anchor, **When** the address is
   opened again, **Then** the browser lands on that heading.
5. **Given** a reader switches between light and dark appearance, **When** they
   navigate to another page or return later, **Then** their choice is preserved
   in their browser.
6. **Given** a reader opens an address that does not exist on the site, **When**
   the host serves the not-found response, **Then** the reader sees a styled page
   consistent with the rest of the site that offers a way back to the home page
   and to search.
7. **Given** the reader's browser cannot reach the wiki instance, **When** they
   browse the published site, **Then** every page, asset, style, script, font,
   and rendering resource still loads, because the site never requests content
   from the wiki instance or any third-party content network at read time.

---

### User Story 4 - Search the published site without a server (Priority: P2)

As a reader, I want to search the published site and jump straight to a matching
page, so that a large knowledge base stays usable without me browsing the tree.

**Why this priority**: Search is the primary way readers use a wiki, and it is
achievable entirely in the browser, so losing it would be a visible regression
against the wiki experience. It is separable from the first publish.

**Independent Test**: Publish a page set, disconnect from the wiki instance,
search for terms appearing in page titles and in page bodies, and confirm
matching pages are found, ranked sensibly, and open correctly.

**Acceptance Scenarios**:

1. **Given** a reader enters a query on the published site, **When** results
   appear, **Then** they cover every published page's title and body text and no
   unpublished content.
2. **Given** a reader searches with the wiki instance unreachable, **When**
   results appear, **Then** search worked entirely in the reader's browser.
3. **Given** a reader searches in a non-Latin language such as Chinese, **When**
   results appear, **Then** partial-word and fragment matches are found.
4. **Given** a reader selects a result, **When** the page opens, **Then** it is
   the published page for that result.
5. **Given** a query matches nothing, **When** results are shown, **Then** the
   reader sees a clear empty state in their current interface language.

---

### User Story 5 - Browse the site in multiple languages (Priority: P2)

As a reader of a multilingual wiki, I want each language version to be
separately reachable and to be able to switch languages from any page, so that
the published site serves the same audiences the wiki serves.

**Why this priority**: Multilingual content is a core wiki capability; a
published site that flattens it to one language silently loses content that was
deliberately authored.

**Independent Test**: Publish a translation group with two locales plus a page
that exists in only one locale, then confirm each locale version has its own
address, that switching works both ways, and that the missing translation is
handled without a dead end.

**Acceptance Scenarios**:

1. **Given** a page exists in several locales, **When** the site is published,
   **Then** each locale version is reachable at its own distinct address.
2. **Given** a reader is on a page that has other translations, **When** they
   use the language switcher, **Then** they arrive at the same page in the
   chosen language.
3. **Given** a reader is on a page that has no translation in a language they
   select, **When** they switch, **Then** they are told the translation does not
   exist and are offered a working destination instead of an error.
4. **Given** a reader opens any address on the site, **When** the page renders,
   **Then** the interface text — navigation, search, language switcher, empty and
   error states — is presented in that address's language.
5. **Given** the site's language is determined, **When** a reader opens a page
   directly or shares its address, **Then** the language follows from the
   address alone and does not depend on stored preferences or request headers.

---

### User Story 6 - Keep the public site current (Priority: P3)

As a wiki owner, I want the public site to follow my wiki as I publish, retire,
and reorganize content, so that I do not have to remember to republish or worry
about the site drifting from reality.

**Why this priority**: Valuable for ongoing operation, but the feature already
delivers value with manual publishing, so it can follow the first release.

**Independent Test**: Enable automatic publishing, publish a page in the wiki,
and confirm the public site reflects it without any manual action; then enable
scheduled publishing and confirm a run occurs on schedule.

**Acceptance Scenarios**:

1. **Given** automatic publishing is enabled, **When** content is published,
   unpublished, deleted, renamed, moved, or has its visibility changed, **Then**
   a publish is triggered without manual action.
2. **Given** scheduled publishing is enabled with an interval, **When** the
   interval elapses, **Then** a publish runs and its outcome is recorded.
3. **Given** a publish is already running, **When** further triggers arrive,
   **Then** they collapse into at most one additional full publish rather than
   queueing one run per trigger.
4. **Given** automatic and scheduled publishing are both disabled, **When**
   content changes, **Then** nothing is published until an Admin starts a
   publish manually.
5. **Given** the Git export feature is also enabled, **When** either feature
   runs, **Then** it does not block, overwrite, or alter the other's target,
   state, schedule, or artifact.

---

### User Story 7 - Take the public site down (Priority: P3)

As a wiki owner, I want to stop publishing and remove the published site, so
that I can revoke public access to content I no longer want served.

**Why this priority**: Publishing is only safe if it is reversible from within
the product; without it, a mistake forces the owner into manual repository
surgery.

**Independent Test**: Publish a site, then take it down from the wiki, and
confirm no further publishes occur and that the previously published pages no
longer serve content.

**Acceptance Scenarios**:

1. **Given** publishing is configured, **When** an Admin disables it, **Then**
   no further publishes occur from any trigger.
2. **Given** an Admin requests takedown, **When** they confirm an action
   described as removing the public site, **Then** the published content is
   removed from the target and previously published addresses stop serving it.
3. **Given** an Admin removes the target configuration, **When** it is removed,
   **Then** the stored credential is destroyed and cannot be recovered.

---

### Edge Cases

- **Nothing to publish**: no page satisfies the public criteria. The publish must
  end in a clearly reported state, must not produce a broken or empty-looking
  site accidentally, and must not silently overwrite an existing site with
  nothing without the Admin having asked for takedown.
- **Reserved address collision**: a page path collides with an address the site
  itself needs (home, search, assets, not-found). The collision must be resolved
  deterministically without dropping the page silently.
- **Path characters and case**: paths containing non-ASCII characters, spaces, or
  differing only in letter case must produce addresses that work on
  case-sensitive hosts and remain shareable and bookmarkable.
- **Site served from a sub-path**: when the host serves the site under a
  sub-path rather than a domain root, every link, asset, and search result must
  still resolve.
- **Host limits exceeded**: the artifact exceeds the host's size limits, or an
  individual asset does. The publish must fail with an explanatory message
  rather than leaving a partially published site.
- **Target diverged**: the target branch was modified outside the wiki. The
  publish must reconcile deterministically and report that it did so, without
  interleaving foreign files into the served site.
- **Credential expired or revoked**: the publish must fail with a message that
  identifies the credential as the cause without exposing it, and the existing
  site must remain intact.
- **Publish interrupted**: the process stops mid-publish. Readers must continue
  to see the last complete site, never a half-updated one.
- **Page removed after indexing**: a previously published address is retired
  while search engines still link to it; the reader must receive the site's own
  not-found page.
- **Extremely large knowledge base**: the number of published pages makes a
  single search payload impractical; search must remain usable rather than
  forcing the reader to download the entire corpus at once.
- **Concurrent takedown and publish**: a takedown requested while a publish is
  running must not result in a republished site.

## Requirements *(mandatory)*

### Functional Requirements

**Target and artifact**

- **FR-001**: The system MUST let an Admin configure a static site publishing
  target independently of any other export or sync feature, including the
  destination repository, branch, the public base address the site will be
  served from, and which host serves the site.
- **FR-002**: The system MUST NOT couple static site publishing to Git export.
  Independence here means the absence of change coupling: each has its own
  enablement, target, trigger settings, run state, and history, and either may
  be used with the other absent, disabled, or failing. It does not mean
  duplicating shared infrastructure — an access credential identifies an
  account, not a feature, and where both features reach the same account they
  MUST authenticate as that account rather than each holding a separate copy.
- **FR-002a**: Credentials for an external service MUST be configured once, in
  a surface of their own, and reused by every feature that reaches that service.
  A per-feature credential would mean multiple keys to install and multiple
  places to rotate, and hosts that enforce deploy-key uniqueness reject the
  second registration outright.
- **FR-002b**: Removing a credential MUST be refused while a feature still
  depends on it, so disconnecting a service cannot silently break publishing.
- **FR-003**: The published artifact MUST be directly servable by a static host
  with no build, template, or transformation step performed by the host.
- **FR-003a**: The configuration MUST name which host serves the site, and MUST
  be structured so that additional hosts can be offered without changing how
  the artifact is generated. GitHub Pages is the first; the artifact is
  deliberately host-neutral.
- **FR-004**: Each publish MUST produce a complete snapshot that fully replaces
  the previously published site, so that content no longer eligible for
  publication disappears without a separate cleanup step.
- **FR-005**: The artifact MUST include a site home page presenting the
  published content tree, a not-found page styled consistently with the site,
  and a machine-readable listing of the site's public addresses for search
  engines.
- **FR-006**: The artifact MUST remain servable from a host sub-path as well as
  from a domain root, with all navigation, assets, and search results resolving
  correctly in both cases.

**Content selection and disclosure control**

- **FR-007**: A page MUST be published only if it is not deleted, has a
  published revision, is marked publicly visible, belongs to a space that
  allows anonymous reading, and belongs to a space whose kind is the ordinary
  authored-wiki kind. All five conditions MUST hold.
- **FR-008**: The artifact MUST NOT contain the title, path, excerpt, body,
  metadata, tags, assets, navigation entry, breadcrumb entry, sitemap entry, or
  search entry of any page that does not satisfy FR-007.
- **FR-009**: A link from a published page to a page that does not satisfy
  FR-007 MUST be rendered as non-navigable text that does not disclose the
  target address.
- **FR-010**: An asset MUST be included in the artifact only if it is referenced
  by at least one published page's published revision.
- **FR-011**: The system MUST publish only content from the published revision
  of each page; drafts, unpublished revisions, and revision history MUST NOT
  appear in the artifact.
- **FR-012**: Before publishing, the system MUST show the Admin how many pages
  will be published and how many are excluded, with exclusion counts grouped by
  reason.
- **FR-013**: Content held in raw-capture spaces (preserved original
  conversation, ingestion, and evidence material) and in generated-knowledge
  spaces (AI-synthesized content awaiting or bypassing authored review) MUST
  NOT be published, regardless of its visibility setting or its space's
  anonymous-read setting. Only ordinary authored wiki spaces are publishable.
- **FR-014**: The system MUST make the exclusion in FR-013 visible rather than
  silent: an Admin reviewing a pending or completed publish MUST be able to see
  that content was withheld because of its space kind, and MUST be able to
  reach it in the wiki to promote it into an authored wiki page if they want it
  published.

**Presentation consistency**

- **FR-015**: Content presentation on the published site MUST match the wiki's
  reader for the same revision, including formatted text, tables, code
  highlighting, mathematical notation, and diagrams; no supported content
  construct may be dropped or left unrendered.
- **FR-016**: The site's visual design MUST derive from the wiki's existing
  design token and theme system; site-specific hardcoded colors, spacing,
  typography, or duplicated component styling are PROHIBITED.
- **FR-017**: Every published page MUST provide navigation of the published page
  tree, breadcrumbs derived from the page's position, and an in-page table of
  contents.
- **FR-018**: Heading anchors MUST be linkable, copyable, and land on the target
  heading when opened directly.
- **FR-019**: Readers MUST be able to switch between light and dark appearance,
  and their choice MUST persist across pages and visits within their browser.
- **FR-020**: The published site MUST NOT present any control that requires the
  wiki application, including editing, authoring, AI, administration, account,
  or sign-in entry points.

**Self-contained behavior**

- **FR-021**: Reading, navigating, searching, and rendering the published site
  MUST NOT require any request to the wiki instance or to a third-party content
  delivery network at read time; all resources needed for presentation MUST be
  contained in the artifact.
- **FR-022**: The published site MUST provide full-text search over every
  published page's title and body, executed entirely in the reader's browser.
- **FR-023**: Search MUST match partial words and fragments so that non-Latin
  languages, notably Chinese, are searchable.
- **FR-024**: Search MUST remain usable as the published page count grows, and
  MUST NOT require a reader to download the entire corpus before their first
  query.

**Multilingual publishing**

- **FR-025**: Each locale version of a page MUST be published at its own
  distinct, shareable address.
- **FR-026**: A reader MUST be able to switch to any other locale in which the
  current page exists, and MUST be told clearly, with a working alternative,
  when the requested locale does not exist for that page.
- **FR-027**: Interface text on the published site MUST be presented in the
  address's language, drawn from the wiki's existing message catalogs rather
  than site-specific translations.
- **FR-028**: The language of a published page MUST be determined by its address
  alone, not by stored preferences, cookies, or request headers.

**Operation, observability, and safety**

- **FR-029**: Publishing MUST run as background work; the request that starts it
  MUST return immediately and the interface MUST reflect progress and outcome
  asynchronously.
- **FR-030**: The system MUST support publishing on manual request, and MUST
  offer independently switchable automatic publishing on content change and
  scheduled publishing at a configurable interval.
- **FR-031**: Triggers received while a publish is running MUST collapse into at
  most one additional full publish.
- **FR-032**: A failed or interrupted publish MUST leave the previously
  published site intact and servable; partially updated sites are PROHIBITED.
- **FR-033**: The system MUST record, per publish, the outcome, start and
  completion time, page and asset counts, exclusion counts, and, on failure, a
  cause that contains no credential material.
- **FR-034**: The interface MUST show the current publishing state, the last
  successful publish, and a link to the live public site.
- **FR-035**: Credentials MUST be stored encrypted, MUST never be returned to
  the interface after being saved, and MUST never appear in logs, error
  messages, run history, or the artifact.
- **FR-036**: Only Admins MAY view or change publishing configuration, start a
  publish, or request takedown; access denial MUST NOT disclose configuration.
- **FR-037**: An Admin MUST be able to disable publishing and to take the
  published site down, after an explicit confirmation that states the site will
  become unavailable.
- **FR-038**: Removing a publishing target MUST destroy its stored credential.

### Public Content Delivery

- This feature does not change the wiki's own page body, public metadata, or
  public navigation, and does not change how the wiki serves them. It adds a
  separate, externally hosted representation of already-anonymous content.
- The published artifact is itself a fully static representation: every document
  is pre-rendered and served without any query, session lookup, cookie read, or
  header read.
- The artifact MUST NOT contain personalized or session-dependent content of any
  kind, since it is served identically to every reader.
- Mutations that already invalidate the wiki's public representations —
  publishing, unpublishing, deleting, changing a public page's path, title, or
  metadata, changing page visibility, changing a space's anonymous-read setting,
  and changes to public navigation or locale state — MUST additionally mark the
  published site as stale and, when automatic publishing is enabled, trigger a
  republish.

### Key Entities

- **Publishing Target**: Where and how the site is published — destination
  repository, branch, public base address, credential, enabled state, and
  trigger settings. Independent of any export target.
- **Publish Run**: One attempt to produce and deliver a site snapshot. Records
  trigger source, timing, outcome, page and asset counts, exclusion summary, and
  failure cause. Retained as history.
- **Publishable Page Set**: The derived set of pages satisfying the public
  criteria at the moment a run starts, together with the assets they reference
  and the exclusion reasons for everything left out. Rebuildable, never
  canonical.
- **Site Snapshot**: The complete set of ready-to-serve documents, assets,
  presentation resources, navigation data, and search data that constitutes one
  published version of the site.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An Admin who has never used the feature can configure a target and
  see their public site live within 10 minutes, without editing files in the
  destination repository by hand.
- **SC-002**: Across an audit of the entire published artifact, 100% of pages
  that are restricted, unpublished, deleted, in a space that disallows anonymous
  reading, or in a raw-capture or generated-knowledge space are absent —
  including their titles, paths, links, and search entries. Any single
  occurrence is a release blocker.
- **SC-003**: For every published page, 100% of its content constructs — code
  blocks, mathematical notation, diagrams, tables, and images — render on the
  public site exactly as they do in the wiki reader for the same revision.
- **SC-004**: A reader can open any published page, navigate to any other
  published page through the site's own navigation, and reach any heading by
  anchor, with 0 dead internal links across the site.
- **SC-005**: A reader with no access to the wiki instance can browse, search,
  switch language, and switch appearance on the published site with no loss of
  function.
- **SC-006**: A search on the published site returns results in under 1 second
  for a knowledge base of at least 1,000 published pages, and finds 100% of
  pages containing the searched term, including Chinese fragment queries.
- **SC-007**: Every locale version of every published multilingual page is
  reachable at its own address, and language switching succeeds for 100% of
  pages that have the target translation.
- **SC-008**: With automatic publishing enabled, a content change is reflected on
  the public site within 5 minutes without any manual action.
- **SC-009**: A publish that fails for any reason leaves the previously published
  site fully servable in 100% of cases; readers never observe a partially
  updated site.
- **SC-010**: An Admin can take the public site down and confirm previously
  published addresses no longer serve content within 5 minutes.

## Assumptions

- **Publishing does not widen visibility.** The eligibility rule reuses the
  wiki's existing anonymous-read semantics, so every published page was already
  readable by anonymous visitors on the wiki itself. Publishing changes where
  that content is served and how much traffic it can absorb, not who may see it.
  A separate per-page "publish to public site" flag is therefore not introduced;
  the existing visibility controls are the governing act.
- **Only authored wiki spaces are publishable.** Raw-capture spaces hold
  preserved original evidence kept for grounding, not for readers, and
  generated-knowledge spaces hold AI synthesis that has not passed through
  authored review. Publishing either to a permanent, indexable, mirrored public
  artifact carries different consent and accuracy consequences than publishing
  an authored page, and a single space-level misconfiguration would otherwise
  push raw conversation transcripts onto the public internet. An owner who wants
  such content published promotes it into an authored wiki page first, which is
  the governed act that makes it publishable.
- **Full snapshots, not incremental updates.** Replacing the whole site each
  time is what makes removal of retired content automatic and makes the artifact
  a deterministic function of current wiki state. Incremental publishing is out
  of scope.
- **GitHub Pages is the first target, not a dependency.** The artifact is plain
  static files and must not rely on host-proprietary features, so it can be
  served by any static host. Only the delivery mechanism is GitHub-specific.
- **The destination branch belongs to this feature.** The wiki fully owns the
  contents of the configured branch; files placed there by other tools are not
  preserved across publishes.
- **Scale assumption**: knowledge bases up to roughly 10,000 published pages and
  a total artifact size within common static-host limits. Beyond that, the
  publish is expected to report a limit failure rather than degrade silently.
- **Reader-facing only**: the site serves current published content. Revision
  history, diffs, comments, and any form of reader contribution are out of
  scope.
- **Existing capabilities are reused rather than reinvented**: the wiki's
  content rendering, design tokens and themes, message catalogs, page tree,
  breadcrumb rules, background job execution, encrypted credential storage, and
  admin permission model all apply unchanged to this feature.
- **Analytics**: if the wiki already has a configured analytics integration, its
  reader-side snippet may be included in the published site; no new analytics
  capability is introduced by this feature.
- **One-way only**: the published site is never read back as a content source,
  and edits made in the destination repository are never imported.
- **One account per external service.** A credential identifies an account, and
  a deployment reaches a given service as one account, so the integration
  surface holds one credential per service. Multiple accounts for one service is
  a plausible later need and is not in scope.
- **One target per deployment** in this iteration. Publishing different subsets
  of the wiki to several sites is a plausible later need but is not in scope
  here, and the design should not foreclose it.

## Dependencies

- Existing page visibility, space anonymous-read, and space kind semantics as
  the sole eligibility source.
- Existing content rendering behavior, so that published output matches the
  reader.
- Existing design token, theme, and interface message catalogs, so that the site
  is consistent and localized without duplicating assets.
- Existing background job execution and encrypted credential storage.
- A destination repository the wiki can write to, and a static host configured
  by the owner to serve the destination branch. DNS and custom-domain setup on
  the host remain the owner's responsibility and are out of scope.
- **New dependency, explicitly justified**: satisfying browser-side search over
  a large multilingual corpus (FR-021 through FR-023) requires a publish-time
  index builder capable of segmenting non-whitespace-delimited languages and
  emitting a chunked index. It ships inside the application image, runs only
  when a publish runs, and introduces no new service, no new stateful component,
  and no additional setup step for a deployment that never publishes. Producing
  the site's stylesheet and interactive runtime likewise adds build-time-only
  tooling. No other new dependency is introduced.

## Out of Scope

- Incremental or partial publishing.
- Publishing raw-capture or generated-knowledge spaces, in any form, including
  behind an opt-in setting.
- Publishing non-public content behind any form of site-level password or
  access gate.
- Independent theming of the published site separate from the wiki's theme.
- Reader-side contributions of any kind on the published site, including
  comments, edit suggestions, and feedback forms.
- Importing changes made in the destination repository back into the wiki.
- Custom domain, DNS, and TLS configuration on the static host.
- Publishing to hosts requiring a server-side runtime.
