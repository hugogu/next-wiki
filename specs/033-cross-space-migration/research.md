# Research: Cross-Space Page Migration

## D1 — Use a dedicated migration operation, not import/export runs

**Decision**: Add a dedicated cross-space migration operation and item model,
service, and pg-boss queue.

**Rationale**: Import/export runs carry external-source, artifact-retention,
and Admin-only transfer semantics. A page reclassification operates on existing
in-place pages and needs a preview snapshot, destination mapping, conditional
route redirects, and per-page resume behavior. A distinct model makes those
rules explicit and avoids coupling unrelated operations.

**Alternatives considered**: Reuse transfer runs (rejected: incorrect source
semantics and overly broad operation lock); extend the current synchronous
single-page move (rejected: cannot provide folders, preview, recovery, or
consistent REST/MCP behavior).

## D2 — Persist previewed selection before starting work

**Decision**: A preview creates durable item rows with expected source state,
destination mapping, conflicts, adaptations, and an expiry. Confirmation starts
only that preview after rechecking its fingerprint.

**Rationale**: A folder can change between a browser preview and confirmation.
Persisting the reviewed selection prevents moving new descendants or a page
whose revision/path changed after review. Repeating the same confirmation
returns the existing operation; changed options or stale state require a fresh
preview.

**Alternatives considered**: Recompute selection at execution time (rejected:
confirmation could act on unreviewed content); client-only preview token
(rejected: not durable or auditable).

## D3 — Process one selected page per short transaction

**Decision**: The worker locks and completes one migration item/page at a time,
then records a monotonic item outcome. It checks cancellation between items.

**Rationale**: A full subtree can be large. Per-item transactions retain data
consistency and recovery while avoiding a long database lock. Completed items
are idempotent on retry; a changed source/destination becomes a reported
conflict rather than a partial update.

**Alternatives considered**: One transaction for the entire folder (rejected:
long locks and poor recovery); automatic collision suffixes (rejected: the user
must resolve previewed conflicts explicitly).

## D4 — Keep AI Generation administrator-curated

**Decision**: Require Administrator authority for a cross-space migration while
AI Generation remains administrator-curated. API and MCP callers must carry
the same effective authority and write scope.

**Rationale**: Current generated-space create/edit/publish policy is
Administrator-only. Allowing an Editor to move a page into that space would
silently change its governance model. This release provides the requested
reclassification without expanding that permission boundary.

**Alternatives considered**: Permit Editors with destination create permission
(rejected: no such generated permission exists today); change generated-space
governance (rejected: separate authorization feature).

## D5 — Move translation groups together and re-home destination metadata

**Decision**: A selectable source page is an original page. Its translation
group variants move together; an individual translation cannot be selected.
Every moved variant gets a destination-facing revision that re-resolves tags
and structured metadata in the destination space, and performs required OKF
adaptation once.

**Rationale**: Page addresses are `(space, path, locale)` and tags belong to a
space. Moving only one localization would split a translation group; retaining
source-space tag rows would make destination tags disappear. The new revision
preserves all historical source revisions while making current destination
metadata correct and auditable.

**Alternatives considered**: Move localizations independently (rejected:
breaks the translation relationship); update the page row without a revision
(rejected: tag/provenance changes would be unversioned).

## D6 — Classify imported material without inventing model provenance

**Decision**: A Wiki.js page moved into AI Generation keeps its import source
metadata, is marked as a human-initiated classification, and uses a human actor
on any migration revision. It does not infer a model, prompt, or machine author.

**Rationale**: Space classification is not evidence of who generated a page.
Preserving the source plus an explicit migration audit record makes the decision
reviewable without misrepresenting provenance.

**Alternatives considered**: Mark the migration revision as machine-authored
(rejected: false provenance); remove import metadata (rejected: destroys source
evidence).

## D7 — Preserve a single public address through conditional redirects

**Decision**: For every moved page, record its prior canonical route in the
existing page-route redirect store with a cross-space migration reason. The
reader redirects only after checking that the target is currently published and
public.

**Rationale**: Page ID is durable but a space move changes its canonical URL.
The existing reader already resolves redirects after a fresh public eligibility
check, so old routes do not reveal protected targets or create a second public
document.

**Alternatives considered**: Keep the old route active (rejected: duplicate
canonical documents); permanent redirect (rejected: access-revocation leak).

## D8 — Default to the more restrictive visibility

**Decision**: A move retains the more restrictive of source visibility and the
destination default unless an Administrator explicitly selects a more permissive
result. Moving a draft never publishes it.

**Rationale**: Reclassification should not broaden readership. This corrects
the current single-page move, which can make a restricted generated page public
when moving to Wiki.

**Alternatives considered**: Always use destination default (rejected: can
broaden access); always preserve source visibility (rejected: ignores a stricter
destination default).

## D9 — Handle only supported references automatically

**Decision**: Preview and execute stable ID references and structurally
recognized internal links through a shared cross-space resolver. It creates a
new revision only for safe rewrites; ambiguous Markdown links are warnings in
the operation result rather than silent edits.

**Rationale**: Current backlinks/outbound links are dynamically derived and
mostly same-space path based. A generic Markdown rewrite can alter unrelated
URLs or text. Explicit handling preserves known links and makes remaining work
visible.

**Alternatives considered**: Ignore all links (rejected: breaks supported page
relationships); rewrite every path-like string (rejected: unsafe content
mutation).

## D10 — One shared REST/MCP contract with a durable status resource

**Decision**: Expose preview, confirmed start, status, item list, and
cancellation through the versioned REST contract. MCP tools call the same
resources and services using the preview-then-start workflow.

**Rationale**: A confirmation request can return immediately with an operation
ID while a folder migration continues safely. Shared schemas and a common
service keep web, REST, and MCP results/authorization aligned.

**Alternatives considered**: Expose the internal admin route directly
(rejected: it is synchronous and not a stable public contract); make MCP mutate
the database independently (rejected: violates the shared service/permission
boundary).
