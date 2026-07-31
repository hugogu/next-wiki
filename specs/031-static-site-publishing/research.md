# Phase 0 Research: Static Site Publishing

**Feature**: `031-static-site-publishing` | **Date**: 2026-07-31

This document resolves every technical unknown in the plan's Technical Context.
Each decision records what was chosen, why, and what was rejected.

---

## R1. How the page HTML is produced

**Decision**: Render each page's document with React's static renderer
(`react-dom/server`'s `renderToStaticMarkup`) inside the publish job, composing
the existing reader components. The Markdown body comes from the existing
`renderMarkdown()` in `apps/web/src/server/pipeline/index.ts`, passed through
the existing `injectHeadingIds()` / `extractHeadings()` from
`apps/web/src/lib/html.ts`, then embedded into a static shell.

**Rationale**:

- FR-015 requires content parity with the wiki reader. The reader gets its HTML
  from `renderMarkdown()`; using the same function is the only way parity is
  structurally guaranteed rather than maintained by hand. This is also what P4
  ("Rendering Pipeline is Sacred") demands — the pipeline is the single source
  of rendered output.
- FR-016 requires the same design system. `renderToStaticMarkup` lets the shell
  import the real `@/components/ui/*` primitives, so P6 is satisfied by
  construction and no parallel component tree exists to drift.
- Heading IDs, anchors (FR-017), and the in-page table of contents (FR-016)
  already have a tested implementation in `lib/html.ts`; reusing it avoids a
  second slugify with different collision behavior for CJK headings.

**Alternatives rejected**:

- *Handwritten HTML template strings*: fastest to start, but it forks the
  design system and guarantees drift the first time a reader component changes.
  Directly violates P6 and the "per-page bespoke styling" anti-pattern.
- *Next.js `output: 'export'`*: the app depends on the database, sessions, API
  routes, and AI at render time; a static export would require a second
  application. Rejected on cost and on the fact that it cannot express the
  publish-time content filter.
- *Reusing the reader route's rendered response over HTTP*: would make the job
  depend on the app being reachable from the worker, embed session-shaped
  chrome, and require scrubbing personalized controls out of delivered HTML.
  Filtering at the source is safer than sanitizing after the fact.

**Consequence**: the publish job runs React rendering server-side. It must not
import client-only modules at the top level; interactive parts are hydrated by
the client runtime (R3).

---

## R2. How the stylesheet is produced

**Decision**: Compile one self-contained stylesheet at **image build time**
using the Tailwind CLI (already a dependency at `tailwindcss@^3.4.17`) with
`apps/web/app/globals.css` as input and the static-site shell components as the
content scan target. Ship it, plus `katex/dist/katex.min.css` and the KaTeX font
files from `node_modules`, as build artifacts that the publish job copies
verbatim into every site snapshot.

**Rationale**:

- FR-020 forbids read-time requests to the wiki or any third-party CDN, so the
  stylesheet and every font it references must live inside the artifact.
- `globals.css` already carries the full token system, the `.prose` content
  styles, and the `hljs` syntax-highlighting rules as first-party CSS (verified:
  the project does not import a highlight.js theme package — the rules are
  defined locally at `globals.css:310+`). One compiled file therefore covers
  content styling and code highlighting with no extra vendored assets.
- The stylesheet does not vary with wiki content, so compiling per publish would
  waste work and add a Tailwind invocation to every run. Build time is the
  correct boundary.
- The body/display font stacks (`Crimson Pro`, `Source Sans 3`) are declared as
  CSS variables with system fallbacks and are **not** loaded via `next/font` or
  a Google Fonts link anywhere in the app. No web-font payload is therefore
  required for parity; KaTeX is the only component shipping its own fonts.

**Alternatives rejected**:

- *Extracting Next's built CSS from `.next/static/css`*: hash-named,
  route-split, and an undocumented internal layout. Brittle across Next
  upgrades.
- *Compiling Tailwind during each publish*: adds seconds to every run and makes
  a content publish depend on a working CSS toolchain at runtime.

**Open consequence**: admin-configurable appearance tokens are per-deployment
and *do* vary. They are handled separately in R10 as an inlined `<style>` block,
not as part of the compiled stylesheet.

---

## R3. How interactive behavior reaches the reader

**Decision**: Build a single client runtime bundle at **image build time** with
esbuild (added as a `devDependency` of `apps/web`), whose entry point mounts the
existing client islands — `ContentRenderer` (which already drives `CodeBlock`,
`MermaidBlock`, and `MathPlotLayer`), the theme toggle, the language switcher,
and the search UI. `mermaid` is loaded through a dynamic import so pages without
diagrams never pay for it.

**Rationale**:

- `ContentRenderer` (`apps/web/src/components/renderer/ContentRenderer.tsx`) is
  already a self-contained client component that scans for `[data-code-block]`
  and `[data-mermaid-block]` markers emitted by the pipeline and mounts React
  roots into them. The static site's HTML contains exactly those markers,
  because it comes from the same `renderMarkdown()`. Reusing it gives
  copy-to-clipboard, mermaid rendering, and math plots with no reimplementation.
- Bundling at build time keeps the artifact deterministic and keeps the publish
  job free of a bundler, matching the R2 boundary.
- `mermaid` is the single largest dependency in the bundle; dynamic import keeps
  the baseline payload small for the majority of pages.

**Alternatives rejected**:

- *Hand-written vanilla JS for the static site*: a second implementation of
  code blocks, mermaid, and math. Violates P6 and doubles the maintenance
  surface for every renderer change.
- *Shipping no JavaScript at all*: would drop mermaid diagrams (which the
  pipeline deliberately defers to the client) and client-side search, failing
  FR-015 and FR-021.

**Consequence**: the artifact contains a small number of fixed-name JS/CSS
assets. Their content hash is computed at build time and used in filenames so
that a reader's browser cache cannot mix versions across publishes.

---

## R4. Client-side search

**Decision**: Use **Pagefind** (`pagefind_extended`, pinned version) as a
publish-time indexing step over the generated HTML, and build the search UI in
first-party components on top of Pagefind's JavaScript API.

**Rationale**:

- FR-023 forbids making the reader download the whole corpus before their first
  query. Pagefind's defining property is a chunked index: the browser fetches a
  small entry point and then only the index shards a query actually touches.
  This is the requirement, not an optimization.
- FR-022 requires Chinese fragment matching. `pagefind_extended` performs CJK
  segmentation at index time, and since v1.5.0 the query side is segmented in
  the browser via `Intl.Segmenter`, so a user typing an unsegmented Chinese
  phrase matches the way the text was indexed.
- Pagefind indexes **the generated HTML directory**. Because that directory
  only ever contains publishable pages (FR-007), the search index inherits the
  content filter structurally — there is no second query path that could leak
  an excluded page into search results (FR-008). This property is worth more
  than any indexing-speed consideration.
- Pagefind publishes musl builds, so it runs on the project's `node:24-alpine`
  runner image alongside the existing `git` and `openssh-client` packages.

**Risks and mitigations**:

- *musl performance regression*: v1.5.0 shipped an allocator change that halved
  indexing throughput on musl; a later patch substitutes jemalloc. **Pin a
  version after that fix** and record the pin in the Dockerfile.
- *Binary size*: `pagefind_extended` is materially larger than the base binary
  because it carries CJK segmentation data. It is added to the runner image
  only, does not run unless a publish runs, and adds no new service — so P1's
  baseline-footprint rule is respected in substance (no new stateful service, no
  new setup step) while the image grows. This is recorded in Complexity
  Tracking.
- *Availability*: if the binary is missing or fails to execute, the publish must
  fail with a clear diagnostic rather than silently shipping a site whose search
  box returns nothing.

**Alternatives rejected**:

- *Orama*: in-memory, all-or-nothing index download — the browser must fetch the
  entire database before searching, which is precisely what FR-023 forbids. Its
  Mandarin tokenizer is also a large WASM payload whose configuration is not
  serialized with the index, so it must be re-instantiated on restore. Suitable
  under a few hundred pages; the spec targets up to 10,000.
- *MiniSearch / FlexSearch / lunr*: same all-or-nothing shape, plus a
  hand-rolled CJK tokenizer.
- *Hand-built sharded bigram index*: reinvents Pagefind's core with none of its
  testing, against the project's preference for established libraries.

**Sources**: [Pagefind installation docs](https://pagefind.app/docs/installation/),
[Pagefind releases](https://github.com/Pagefind/pagefind/releases),
[Orama Chinese support](https://docs.orama.com/docs/orama-js/supported-languages/using-chinese-with-orama),
[Orama data-persistence tokenizer issue](https://github.com/oramasearch/orama/issues/695)

---

## R5. Where publishing configuration and history live

**Decision**: Introduce two new tables, `static_site_targets` and
`static_site_publications`. Do **not** extend `storage_backends` with a
`static_site` purpose.

**Rationale**:

- FR-002 requires the two features to be independent in enablement, target,
  triggers, state, and history. Sharing a row shape with `storage_backends`
  would couple them through the existing
  `storage_backends_type_purpose` unique index and through the shared
  `replicaState` / `isReadPreferred` columns, none of which have meaning for a
  publication target.
- `storage_backends` models *where content bytes live*. A publishing target is
  not a content store: nothing is ever read back from it (spec: one-way only).
  Overloading the table would blur a clean domain boundary for the sake of
  reusing four columns.
- FR-032/FR-033 require per-run history with counts and exclusion summaries.
  `storage_backends` has single-valued `lastSyncAt` / `lastError` columns and no
  place for run records, so a second table is needed regardless. Adding one
  table next to an ill-fitting row is worse than adding two that fit.

**Reused rather than duplicated**: credential encryption via
`@/server/crypto/key-encryption`, the git invocation and credential-environment
approach from `jobs/git-export.ts` (extracted to a shared helper — see R7), the
`assertCanManage*` admin permission pattern, and pg-boss enqueueing via
`@/server/jobs/runtime`.

---

## R6. How the snapshot reaches the host

**Decision**: Reuse the proven Git delivery mechanism from
`apps/web/src/server/jobs/git-export.ts` — shallow fetch or orphan branch,
replace the working tree, commit, push, and fall back to
`--force-with-lease` on divergence — by **extracting** its credential
environment builder and git invocation wrapper into a shared module under
`apps/web/src/server/git/`, then having both features depend on the shared
module.

**Rationale**:

- That code already solves the hard parts: HTTPS-token and SSH auth without
  interactive prompts, network stall timeouts, divergence recovery, and secret
  handling through `GIT_ASKPASS` rather than the URL. Re-deriving it would
  reintroduce solved bugs.
- Extraction is a refactor of shared mechanism, not shared semantics: the two
  features keep separate targets, branches, jobs, and state. FR-002 constrains
  the product behavior, not the transport helper.
- The runner image already installs `git` and `openssh-client`, so delivery adds
  no new system dependency.

**Sequencing note**: per the project's commit conventions, the extraction lands
as its own refactoring commit with Git export's existing tests unchanged and
passing, before any static-site code depends on it.

**Alternatives rejected**:

- *A Git library (isomorphic-git / simple-git)*: a new dependency to do what the
  installed `git` binary already does, with a different auth surface to secure.
- *The GitHub Contents/Trees REST API*: ties the feature to GitHub, contradicting
  the spec's assumption that the artifact is host-neutral, and makes a
  thousand-file snapshot an API-call storm.

---

## R7. Address scheme, base path, and host quirks

**Decision**:

- Each page is emitted as `<path>/index.html` so its public address is the
  directory form `/<path>/`, matching the wiki's own reader URL for the same
  page and preserving P11's shareable-URL contract.
- Translations keep the wiki's existing convention: `/<locale>/<path>/`, the
  same prefix the reader route already resolves in
  `app/(public)/[...path]/page.tsx`.
- Every in-document reference is written **root-relative against a configured
  base path** (for example `/wiki/`), which is derived from the target's
  configured public base address. This is what makes a project-site sub-path
  deployment work (FR-006).
- A `.nojekyll` marker is always written so the host serves files verbatim
  instead of running Jekyll — this is what makes "no build step performed by the
  host" (FR-003) literally true on GitHub Pages, and it also stops paths
  beginning with an underscore from being silently dropped.
- `404.html` is emitted at the artifact root, which GitHub Pages serves for
  unmatched addresses (FR-005, and the "page removed after indexing" edge case).

**Path normalization**: wiki paths may contain non-ASCII characters, spaces, and
case variants. Addresses are percent-encoded for links while directory names are
written in NFC-normalized literal form; a case-insensitive collision between two
distinct paths is detected during generation and fails the publish with both
paths named, rather than letting one silently overwrite the other on a
case-insensitive filesystem.

**Reserved prefixes**: the artifact reserves a small set of internal prefixes
(assets, the client runtime, the search index). A page whose path would collide
is detected during generation and the publish fails with the conflict named —
deterministic and loud, per the spec's edge case.

---

## R8. Content locale versus interface locale

**Decision**: Treat these as the two separate domains the codebase already
treats them as.

- **Content locale** (`pages.locale`, grouped by `translation_group_id`)
  determines which document is published at which address, and is decided by the
  address alone (FR-024, FR-027). The language switcher is generated per page
  from that page's translation group, so it only ever offers translations that
  actually exist; when a reader arrives at a locale that does not exist for a
  page, they get a generated stub explaining this and linking to the available
  versions (FR-025) rather than a 404.
- **Interface locale** (`uiLocales` = `en` | `zh`, catalogs in
  `apps/web/messages/`) determines the chrome text. The static shell is rendered
  with the interface locale that best matches the document's content locale,
  falling back to `defaultLocale`. Interface strings come from the existing
  catalogs (FR-026); no site-specific translation file is introduced.

**Rationale**: the wiki itself renders public documents with a fixed
request-independent UI locale (`staticPublicLocale`) precisely so the document
body cannot vary by session (P12). The static site has no session at all, so
binding chrome language to the document's own language is both simpler and
strictly closer to FR-027 than carrying the cookie behavior across.

**Consequence**: new message keys needed by the static shell (search
placeholder, empty state, missing-translation notice) are added to both `en.json`
and `zh.json`, and are covered by the existing catalog-parity test.

---

## R9. Applying the deployment's appearance settings

**Decision**: Inline a `<style>` block into every generated document containing
the deployment's configured appearance tokens, produced by the existing
`buildUserAppearanceCss()` in `apps/web/src/server/appearance/style.ts`, and
carry the light/dark switch with the same `html.dark` class contract the app
uses.

**Rationale**: `globals.css` supplies the default token values; the admin's
configured overrides live in the database and vary per deployment, so they
cannot be baked into the build-time stylesheet (R2). Reusing the existing CSS
builder keeps one implementation of token serialization, and the existing
`css-sanitize` boundary continues to apply to admin-authored CSS.

**Dark mode persistence** (FR-018) uses the same `localStorage` key and
`html.dark` class the app's `ThemeProvider` uses, with a tiny inline script that
applies the stored choice before first paint to avoid a flash.

---

## R10. Enforcing the content filter

**Decision**: Compute the publishable set **once per run** as a single query
joining pages, their published revisions, and their spaces, filtering on all
five conditions of FR-007 (not deleted, has a published revision, publicly
visible, space allows anonymous read, space kind is the ordinary wiki kind).
Everything downstream — navigation tree, breadcrumbs, sitemap, link rewriting,
asset selection, search index — is derived from that one set.

**Rationale**: SC-002 makes a single leak a release blocker. The only way to get
that assurance cheaply is to have exactly one place where eligibility is
decided, with every consumer downstream of it. A second query that "also filters"
is a second chance to get it wrong.

**Link rewriting**: internal links are resolved against the publishable set. A
link whose target is not in the set is replaced with plain text carrying no
address (FR-009). This runs on the rendered HTML, after `renderMarkdown()`, so
it sees the same anchors the reader would.

**Assets**: selected by joining `content_asset_refs` against the published
revisions of publishable pages only (FR-010), mirroring the existing Git export
query but with the eligibility filter applied.

**Testing consequence**: the highest-value test in this feature is a negative
one — build a fixture wiki containing restricted pages, non-anonymous spaces,
raw and generated spaces, and cross-links between them, generate a snapshot, and
assert that no excluded title, path, or asset id appears anywhere in the byte
content of the artifact.

---

## R11. Run lifecycle and failure atomicity

**Decision**: Generate the complete snapshot into a temporary directory, verify
it, and only then replace the checkout's working tree, commit, and push. Any
failure before the push leaves the remote untouched. Concurrency follows the
existing Git export pattern: one active run per target in the worker, with
further triggers collapsing into a single follow-up run.

**Rationale**: FR-031 forbids a partially updated site. Because delivery is a
single Git push of a complete tree, atomicity comes from the transport for free
— readers see either the previous commit or the new one. This is a real
advantage of Git delivery over per-file upload APIs and reinforces R6.

**Size preflight**: total artifact size and largest single file are measured
before delivery and checked against configured ceilings, failing the run with an
explanatory message (edge case: host limits exceeded) rather than pushing
something the host will reject.

---

## R12. Testing strategy

- **Unit (Vitest)**: eligibility query, link rewriting and downgrade, path
  normalization and collision detection, base-path resolution, sitemap and
  navigation generation, appearance CSS inlining, size preflight.
- **Contract**: the admin REST surface for targets, runs, and takedown.
- **Integration (Vitest)**: full snapshot generation against a seeded database
  into a temp directory, including the negative leak assertion from R10 — the
  release-blocking test for SC-002.
- **E2E (Playwright)**: admin configures a target and triggers a publish; and,
  separately, a generated snapshot served from a static file server is driven
  through navigation, anchor jumps, search (including a Chinese query), language
  switching, and dark mode, with the wiki app unreachable — which is the only
  honest way to verify FR-020.

The existing `apps/web/e2e/` suite and Vitest layout are used unchanged. Per the
project's recorded practice, e2e runs require no stray dev servers, and reset
specs must not use `TRUNCATE ... CASCADE`.
