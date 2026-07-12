# Research: AI Page Translation

## Decision 1: Store translated documents as ordinary pages and revisions

**Decision**: A translation is a second `pages` record sharing the source path and having its target `locale`, plus normal published `page_revisions`. Add translation group/mapping and revision-provenance records instead of a separate content store.

**Rationale**: `pages` already has unique `(space_id, path, locale)` identity, while `page_revisions` already stores source Markdown, sanitized rendered HTML, hashes, immutable version numbers, metadata, and assets. Reusing it gives translations the same reader behavior, history, replication, rendering, and cacheable HTML as authored pages.

**Alternatives considered**:

- A new translation-content table: rejected because it would create a second rendering/version path and violate AI-content parity.
- Store translations in `ai_actions` artifacts: rejected because action inputs, events, and artifacts expire and cannot be durable page history.
- Treat UI dictionary locale as content locale: rejected because cookie/header UI locale is not a stable reader address and is limited to interface strings.

## Decision 2: Use explicit translation groups

**Decision**: Add `translation_groups` with one source page and add nullable `translation_group_id` to translated pages. The unprefixed resolver selects the source page; the language resolver selects the page in the source's group with the requested locale. Existing pages migrate as source pages.

**Rationale**: A group makes parentage explicit and fulfils the language-content mandate without mistaking unrelated imported same-path locale pages for a translation. It supports a translation's independent permission policy; access is evaluated for source context and translated resource, not inherited as copied permission data.

**Alternatives considered**:

- Infer parentage from matching path and locale: rejected because renamed, imported, or unrelated localized pages can collide semantically.
- Add only `source_page_id`: rejected because it bypasses the project's `translation_group_id` multi-language invariant.

## Decision 3: Use language-prefixed reader routes, never UI locale selection

**Decision**: Keep existing `/{path}` routes for source content. Add `/{language}/{path}` reader routes that validate language against enabled translation languages. Extend URL builders, metadata canonical/hreflang output, sitemap policy, and public page lookup with explicit content-locale semantics.

**Rationale**: The address is stable, shareable, cacheable, and does not vary with cookie or `Accept-Language`. Static application routes continue to take precedence over the new catch-all route.

**Alternatives considered**:

- Redirect source URLs based on browser/UI locale: rejected because unprefixed URLs must show original content and caching would fragment.
- Use `?lang=xx`: rejected because the requested language prefix is canonical.

## Decision 4: Use durable run/item records and a dedicated worker queue

**Decision**: Model language work as `translation_runs` and `translation_run_items`, with explicit pause/cancel controls, counters, and per-page attempts. Process it on a new long-running `translation` pg-boss queue with boot recovery and a refresh reconciler.

**Rationale**: The existing transfer run/item workflow already persists incremental progress and supports pause/resume/retry. It fits better than the current AI action lifecycle, which is transient and does not model paused batch work. A dedicated queue prevents bulk language work from starving interactive AI features.

**Alternatives considered**:

- One giant AI action per language: rejected because events/input expire and a single retry cannot safely recover per-page outcomes.
- One synchronous request per page: rejected by async-first requirements.
- Reuse the interactive `ai-action` queue: rejected because a large language run can starve questions, optimization, and images.

## Decision 5: Freeze model/prompt inputs and preserve detailed usage

**Decision**: Resolve a compatible configured text model at run creation, snapshot provider/model identifiers and names, and reference an immutable translation prompt version. Each item records provider request id, duration, input/output/cached token values and whether each is provider-reported, estimated, or unavailable.

**Rationale**: Model assignments and prompt text may change after a run begins; immutable snapshots make a displayed translation reproducible and analytics honest. The existing adapter's text stream already yields normalized usage and provider-request-id events when available.

**Alternatives considered**:

- Read current model/prompt while every item runs: rejected because a run would silently mix models/styles.
- Record missing usage as zero: rejected because it corrupts analysis.

## Decision 6: Refresh only after source publication and reject stale output

**Decision**: After `revisions.publish()` commits an original page, mark translations stale and upsert/coalesce refresh items for the latest published revision. Before writing a result, re-read the current original revision/hash; a changed source marks the attempt superseded and queues newer refresh instead of publishing stale output.

**Rationale**: Draft changes must not change public translations. The existing publish service is the common post-commit point already used by Git export and AI-index reconciliation, while item-level compare-before-write closes the race between a model call and a new publication.

**Alternatives considered**:

- Queue refresh at draft save: rejected because draft content is not reader content and can create needless paid work.
- Publish then schedule a correction: rejected because readers could receive known-stale output.

## Decision 7: Cache rendered revision data, not permission-varying pages

**Decision**: Continue using `page_revisions.content_html` as the durable render cache. Add cacheable read helpers only for published public revision data, keyed by page/revision/content hash/content locale. Invalidate source and translation path tags when publication, translation success, path change, deletion, or visibility change occurs; admin, draft, and permission-varying views remain dynamic.

**Rationale**: Current public routes are dynamic because UI locale and actor state vary. Caching the entire response risks permission leakage, whereas immutable rendered revision data is safe after authorization.

**Alternatives considered**:

- Cache complete pages regardless of actor: rejected due to permissions and cookie-based interface locale.
- Regenerate HTML at every translation read: rejected because revisions already persist safe rendered HTML.
