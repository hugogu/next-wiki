# Feature Specification: AI Page Translation

**Feature Branch**: `015-multilingual-ai-translation`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "提供多语言的支持，能通过AI为所有页面生成各个语言的翻译文档。不同语言版本有独立的URL以便缓存。URL使用语言二字码作为前缀。无语言前缀时，默认打开原始版本（而非翻译版）。因页面比较多，页面的翻译需要任务化，每次翻译一个语言，并可控制进展（可中断，可继续，可换模型重新翻译），翻译出的页面也需要支持版本化，同时需要标注生成时所使用的模型。翻译过程需要有可定义的提示词用于控制翻译风格。注意翻译的页面，在原始页面发生变更时，也需要自动以后台任务的形式进行自动刷新。翻译产出的页面html要和原始页面一起支持缓存，并记录翻译过程中的数据（如Token消耗，处理时长等）以便后续的数据分析。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read an original page or its translation (Priority: P1)

As a reader, I want each translated version of a published page to have a
stable language-prefixed address while the unprefixed address always remains
the original page, so that I can share, bookmark, and quickly revisit the
correct language without confusing the source with a translation.

**Why this priority**: Stable, unambiguous reading is the visible value of the
feature and establishes that translations are derived from—not replacements
for—the original content.

**Independent Test**: Publish a source page and a completed English translation;
open both the original address and the language-prefixed address, then refresh
and share each link to confirm they consistently show the intended content.

**Acceptance Scenarios**:

1. **Given** a reader can view a published source page, **When** they open its
   normal, unprefixed address, **Then** they see the current original content
   rather than any translated version.
2. **Given** a current translation exists for a language, **When** an authorized
   reader opens the corresponding address beginning with that language's
   two-letter code, **Then** they see that language's current translated
   content with normal page navigation and source-page context.
3. **Given** a translation does not exist, is being generated, or has failed,
   **When** a reader opens its language-prefixed address, **Then** the system
   clearly reports its unavailable or in-progress state without substituting a
   different language or silently presenting the original as a translation.
4. **Given** a reader cannot view the source page, **When** they request any of
   its language-prefixed addresses, **Then** the system does not reveal the
   page, its translation status, title, content, or history.
5. **Given** source and translated rendered pages have been served before,
   **When** an authorized reader revisits either stable address, **Then** they
   receive its current rendered content without having to regenerate it.

---

### User Story 2 - Configure a translation language and style (Priority: P1)

As an administrator, I want to enable a target language and define the
translation instructions and model to use, so that all pages in a language
follow an intentional, consistent style while the selected AI service remains
traceable.

**Why this priority**: A bulk translation must have an explicit target,
consistent instructions, and a known model before it can create trustworthy
reader-facing content.

**Independent Test**: Enable a target language, create a named translation
style with instructions, select an available text-generation model, start a
translation, and inspect the resulting version to confirm the chosen style and
model are recorded.

**Acceptance Scenarios**:

1. **Given** an administrator is managing languages, **When** they enable a
   valid two-letter target language, **Then** it becomes available for a
   translation run and its reader URLs use that same code as a prefix.
2. **Given** an administrator defines or revises translation instructions,
   **When** they save the style, **Then** the style has a stable identity and
   its exact saved wording can be identified for every run that uses it.
3. **Given** compatible text-generation models are available, **When** an
   administrator selects one for a language run, **Then** the chosen model is
   displayed before the run begins and is retained with the resulting work.
4. **Given** AI is unavailable, the selected model is no longer usable, or no
   target-language style is selected, **When** an administrator attempts to
   start a run, **Then** the run is not started and the administrator receives
   actionable guidance.

---

### User Story 3 - Translate all pages one language at a time (Priority: P1)

As an administrator, I want to start and monitor a translation run for one
target language across eligible pages, so that a large wiki can be translated
in manageable, observable work without waiting in the browser.

**Why this priority**: Language-at-a-time task control is the requested safety
and operational boundary for a potentially large and costly translation
operation.

**Independent Test**: Start a run for one language containing multiple
published pages, leave the management view, return later, and verify that the
run shows page-by-page progress, outcomes, and a final summary.

**Acceptance Scenarios**:

1. **Given** an administrator selects a target language and a valid style and
   model, **When** they start a full-language translation run, **Then** the
   system creates a durable background task and promptly returns control with
   its initial status.
2. **Given** a language translation run is active, **When** the administrator
   views it, **Then** they can see its queued, running, completed, skipped,
   failed, and remaining page counts, plus the most recent actionable errors.
3. **Given** a run includes multiple eligible pages, **When** one page fails,
   **Then** the failure is recorded against that page and the run continues
   with other pages unless the administrator interrupts it.
4. **Given** an administrator leaves, refreshes, or closes the management
   screen during a run, **When** they return, **Then** the task and its progress
   remain available and accurately reflect completed work.
5. **Given** a page is not eligible for translation, **When** the run reaches
   it, **Then** it is skipped with a recorded reason and no unusable reader
   translation is published.

---

### User Story 4 - Control, resume, and replace translation work (Priority: P1)

As an administrator, I want to interrupt a language run, continue unfinished
work, or deliberately retranslate it with a different model or style, so that
I can respond to quality, cost, and provider changes without losing a clear
history of what happened.

**Why this priority**: The ability to safely control and retry large-scale
generation is explicitly required and prevents an AI batch from becoming an
irreversible operation.

**Independent Test**: Interrupt a run after some pages complete, resume it,
then start a replacement run with another model and confirm completed pages
retain their history while current translations reflect the chosen replacement.

**Acceptance Scenarios**:

1. **Given** a language run has queued or active work, **When** an administrator
   interrupts it, **Then** no further page generation begins after the
   interruption takes effect and completed translations remain readable.
2. **Given** a run was interrupted or has retryable failures, **When** an
   administrator resumes it, **Then** only unfinished or explicitly retryable
   pages are processed and already current successful pages are not needlessly
   replaced.
3. **Given** an administrator chooses a different eligible model, style, or
   both, **When** they request a retranslation for a language, **Then** the
   system creates a distinct replacement task and identifies the replacement
   inputs before it changes any reader-facing translation.
4. **Given** a replacement output is produced for a page, **When** it becomes
   current, **Then** the prior translated version remains available in that
   translation's history with its original model and style information.
5. **Given** two administrators attempt conflicting controls on the same
   language run, **When** the later action is evaluated, **Then** the system
   prevents contradictory state changes and reports the current task state.

---

### User Story 5 - Keep translations current and analyze their cost (Priority: P2)

As an administrator, I want source-page changes to trigger background
translation refreshes and want detailed run metrics, so that readers do not
rely on stale translations and I can understand quality, duration, and AI
usage over time.

**Why this priority**: Automated freshness and analysis make the translation
capability sustainable after the initial bulk run, but they build on the core
language task and versioning behavior.

**Independent Test**: Complete a translation, update and publish its source
page, verify a refresh is queued and produces a new translated version, then
inspect the source linkage, model, prompt style, input/output token use,
duration, and final outcome for the refresh.

**Acceptance Scenarios**:

1. **Given** a translated source page receives a newer published original
   version, **When** the change is accepted, **Then** the system schedules a
   background refresh for each enabled target language with a current
   translation of that page.
2. **Given** several source changes occur before their refresh begins, **When**
   refresh work is processed, **Then** only the newest eligible original is
   translated and an older queued version cannot overwrite it.
3. **Given** a refresh completes, **When** an authorized reader opens the
   language-prefixed page address, **Then** the new translated version is
   current and its prior rendered output is no longer served as current content.
4. **Given** a translation task attempts, completes, fails, is interrupted, or
   is skipped, **When** an administrator inspects its records, **Then** they
   can distinguish the run and page outcome, selected model, style version,
   source and translation versions, token consumption when supplied, processing
   duration, timestamps, and failure reason where applicable.
5. **Given** a translation result was based on a source version that is no
   longer current at completion, **When** the result is evaluated, **Then** it
   is not made the current translation and a refresh for the latest source
   remains pending or is scheduled.

### Edge Cases

- A requested language code conflicts with an existing first-level original
  page path: the system must preserve unprefixed original URL behavior and
  require an unambiguous resolution before enabling the conflicting language.
- A source page contains links, images, code, frontmatter, or other structured
  content: translation must preserve valid structure and retain links/assets
  safely; malformed output must not replace a current readable translation.
- A source page is unpublished, deleted, moved, or loses reader visibility
  while work is queued or running: its translation must not become newly
  readable, and its existing reader output must follow the source's visibility.
- A provider returns incomplete usage information, times out, rate-limits, or
  returns invalid content: the attempt must be recorded accurately without
  inventing metrics or corrupting a current translation.
- A translation run is interrupted while a single page is already being
  processed: the final outcome must be recorded exactly once, with no duplicate
  current version or double-counted usage.
- A page changes repeatedly during a bulk run: only a translation traceable to
  the latest source revision may become current.
- A cached rendered translation is superseded, permission changes, or reader
  access is revoked: later reads must not expose obsolete or unauthorized
  translated content.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support administrator-managed target languages
  identified by normalized two-letter language codes.
- **FR-002**: The normal, unprefixed page address MUST always resolve to the
  original page version and MUST never automatically redirect to or substitute
  a translation.
- **FR-003**: Every current translated page MUST have a stable canonical address
  formed by placing its target language's two-letter code before the original
  page path; different target languages MUST have distinct addresses.
- **FR-004**: The system MUST reject or require resolution of a target-language
  code that would make an original unprefixed page address ambiguous.
- **FR-005**: The system MUST expose a clear reader state for a requested
  translation that is missing, queued, running, failed, or unavailable, and
  MUST NOT silently substitute another language or source content as though it
  were a translation.
- **FR-006**: A translated page MUST remain subject to the source page's
  publication state and read permissions. A requester unable to read the source
  MUST not learn that a translation, task, version, or language association
  exists.
- **FR-007**: Administrators MUST be able to define, revise, select, and retire
  reusable translation styles expressed as instructions that control translation
  tone and behavior.
- **FR-008**: For every translation attempt, the system MUST retain an immutable
  reference to the exact selected translation-style version and selected model,
  even if either is changed later.
- **FR-009**: Administrators MUST be able to launch a durable background
  translation task for one target language across all eligible source pages;
  starting it MUST not require the administrator to keep a browser request
  open.
- **FR-010**: A language translation task MUST expose an administrator-visible
  lifecycle and aggregate progress, including queued, active, interrupted,
  completed, failed, skipped, and remaining work.
- **FR-011**: The system MUST retain a page-level outcome for every page
  considered by a language task, including the source version considered,
  outcome, attempt times, and a comprehensible skip or failure reason where
  relevant.
- **FR-012**: Administrators MUST be able to interrupt an active or queued
  language task. The system MUST stop beginning new page work once interruption
  takes effect, preserve completed output, and record the final state of any
  work already in progress exactly once.
- **FR-013**: Administrators MUST be able to resume interrupted work and retry
  retryable failures without reprocessing current successful pages unless they
  explicitly request a replacement translation.
- **FR-014**: Administrators MUST be able to request a retranslation for a
  target language using a different selected model, a different translation
  style, or both. The replacement MUST be a distinct, traceable task.
- **FR-015**: A completed translation MUST create an immutable translated
  version linked to the precise source version from which it was generated.
  Replacing a translation MUST preserve prior translated versions and their
  provenance in translation history.
- **FR-016**: The system MUST show the model used to generate each translated
  version and make its source version, style version, generation time, and
  current-versus-historical state discoverable to authorized administrators.
- **FR-017**: Translation output MUST preserve the source page's supported
  content structure, links, and asset references sufficiently for it to render
  safely. Invalid or unsafe generated output MUST fail without replacing the
  current readable translation.
- **FR-018**: When a newer original page version is published, the system MUST
  automatically schedule background refresh work for every enabled target
  language that has a current translation of that page.
- **FR-019**: Automatic refresh work MUST coalesce superseded source changes and
  MUST ensure that output based on an older source version cannot become current
  after a newer source version exists.
- **FR-020**: If a source page is unpublished, deleted, moved, or loses reader
  visibility, the system MUST prevent its translation from becoming newly
  visible and reconcile reader access to any existing translation accordingly.
- **FR-021**: The system MUST retain rendered output for each current original
  and translated page version and serve it from cacheable, stable page
  addresses. When a current version changes or becomes inaccessible, subsequent
  reads MUST not serve its superseded or unauthorized rendered output as
  current content.
- **FR-022**: The system MUST retain a durable record for each translation run
  and page attempt, including task and page outcome, selected model, selected
  style version, source version, produced translation version when any,
  timestamps, processing duration, and token consumption when the provider
  supplies it.
- **FR-023**: Translation analytics records MUST distinguish estimated, provider
  reported, and unavailable usage values so later analysis does not treat
  missing values as zero or known values.
- **FR-024**: Administrators MUST be able to review historical language runs,
  page attempts, and their aggregated outcome, duration, and usage data without
  relying on transient progress messages.
- **FR-025**: The browser, background work, and any machine-facing translation
  management surface MUST enforce the established administrator and page access
  controls before creating, viewing, controlling, or exposing translation data.
- **FR-026**: New translation-management and reader-facing labels, statuses,
  errors, and descriptions MUST be localizable consistently with the existing
  interface.
- **FR-027**: Existing original-page addresses, original page version history,
  page editing, publication, rendering, and cache behavior MUST remain
  compatible for users who do not enable or use translations.

### Key Entities

- **Target Language**: An administrator-enabled language identified by a
  normalized two-letter code. It determines the prefix used by translated page
  addresses and may have translation configuration.
- **Translation Style**: A named, versioned set of administrator-authored
  instructions for translation tone and behavior. A historical version remains
  identifiable after a later edit or retirement.
- **Language Translation Run**: A durable administrator-initiated or
  system-initiated background operation for one target language. It records its
  selected model and style, lifecycle, progress, aggregate usage, and reason
  for creation (initial, resume, replacement, or refresh).
- **Translation Page Attempt**: The per-page work item within a language run.
  It links one source version to one outcome and captures page-level duration,
  usage, error/skip information, and any produced translated version.
- **Translated Page Version**: An immutable rendered and source-content version
  derived from one original page version for one target language. It has model
  and style provenance, can be current or historical, and remains separate from
  the original page's version history.
- **Translation Refresh**: Background work requested because a source page's
  current published version changed. It coalesces obsolete source changes and
  protects the current translation from stale output.
- **Translation Usage Record**: Analysis-ready information associated with a
  run or page attempt, including token quantities and their provenance,
  processing duration, provider outcome, and timestamps.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In acceptance testing, 100% of unprefixed page addresses display
  the original content, and 100% of language-prefixed addresses with an
  available translation display only that target-language translation.
- **SC-002**: In a test set with at least 100 pages and two enabled target
  languages, 100% of generated reader translations have unique stable addresses
  and retain a link to their exact source version, model, and style version.
- **SC-003**: In a controlled interruption test of a 50-page language run,
  100% of pages have exactly one final recorded page-attempt outcome, completed
  output remains readable, and resuming processes no already-current page unless
  replacement was expressly requested.
- **SC-004**: In a retranslation test using a changed model or style, 100% of
  replacement translations identify the new inputs while 100% of superseded
  translations remain discoverable in their language-specific history.
- **SC-005**: For a test collection where every translated source page is
  updated at least twice before refresh completion, 100% of current translations
  correspond to the newest published source version; no stale output becomes
  current.
- **SC-006**: For completed, failed, interrupted, and skipped attempts in an
  acceptance run, 100% of records contain task and page outcome, source version,
  selected model, style version, timestamps, and duration; 100% of available
  provider token values retain their reported/estimated/unavailable provenance.
- **SC-007**: Under normal reader load, at least 95% of requests for unchanged
  original or translated published pages return their cached rendered content in
  under one second, measured at the application boundary.
- **SC-008**: In authorization tests across original pages, translated reader
  pages, runs, attempts, and history, 100% of attempts by an unauthorized actor
  are denied without disclosing source titles, translated content, status,
  provenance, or usage data.
- **SC-009**: In acceptance tests with structured Markdown, links, and assets,
  100% of accepted translations render safely and preserve usable supported
  structure; invalid generated output produces no new current translated
  version.

## Assumptions

- The existing original page is the sole authoritative authored document. A
  translation is derived content and does not replace or mutate the original.
- Only current published source pages are eligible for reader-facing automatic
  translation. Draft content remains excluded until it is published.
- Administrators control language configuration, translation styles, model
  selection, task control, history, and analytics. Existing page-read
  permissions continue to determine who can read a translated page.
- Target language codes use the familiar ISO 639-1 two-letter form in lowercase
  (for example, `en` and `zh`). Regional variants and right-to-left language
  presentation are not introduced by this initial slice.
- The existing provider-neutral AI configuration supplies compatible
  text-generation models and may report token usage; some providers may be
  unable to report all usage quantities.
- Original and translation versions use the established rendering and page
  revision expectations. Translation history is independent from original
  history but always linked to a source version.
- Saving a translation style creates a new identifiable version rather than
  retroactively changing the instructions recorded for past translation work.
- Automatic refresh is asynchronous and may complete later; until then the last
  current translation can remain visible only while its source remains readable
  and its refresh status is available to administrators.

## Out of Scope

- Translating the application interface, user preferences, navigation labels,
  administration UI, or language detection/automatic reader redirection.
- Manual editing, collaborative review, side-by-side editorial approval, or
  user-authored overrides of translated page content.
- Region/script-specific language variants, multilingual fallback chains,
  bidirectional layout support, or automatic language identification.
- Translating unpublished drafts, historical source revisions on demand, assets
  themselves, embedded third-party content, or files outside page content.
- Provider billing, cost budgets, chargeback, quality scoring, or an analytics
  dashboard beyond retaining analysis-ready translation records and histories.
- Changing the existing original-page URL structure, original revision model,
  or page permission model.
