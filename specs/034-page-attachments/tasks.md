# Tasks: Page Attachments

**Input**: Design documents from `/specs/034-page-attachments/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/attachments-api.md](./contracts/attachments-api.md), [quickstart.md](./quickstart.md)

**Tests**: Included. The project's binding engineering rules ("Always write unit tests and integration tests for new code changes") and the existing codebase convention (every service/permission module in this feature's blast radius already has a colocated `*.test.ts`, e.g. `content-assets.test.ts` / `content-assets-permissions.test.ts`) both call for tests, so each story includes them.

**Organization**: Tasks are grouped by user story (spec.md priorities P1/P1/P2/P2/P2) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Every task includes an exact file path

## Path Conventions

Existing monorepo layout (no new packages): `apps/web/{app,src}/...`, `packages/shared/src/...`, `packages/mcp-server/src/...`. See plan.md's Project Structure for the full tree.

---

## Phase 1: Setup (Shared Contracts)

**Purpose**: Add the new shared Zod contracts every later task type-checks against.

- [X] T001 [P] Add `'attachments'` to `apiKeyScopeSchema` in `packages/shared/src/api-keys.ts`
- [X] T002 [P] Add `'attachment'` to `contentAssetKindSchema`, and add `attachmentCategorySchema`, `publicAttachmentResourceSchema`, `attachmentSettingsViewSchema`, `attachmentSettingsUpsertSchema` to `packages/shared/src/content-storage.ts` (per contracts/attachments-api.md's "Shared Zod contracts" section)

---

## Phase 2: Foundational (Blocking Prerequisites)

> **Architecture gate resolved (2026-08-06)**: The P7 upload-delivery
> question in plan.md/research.md §10 is settled — the default max
> attachment size is 20 MB (not the original 100 MB), which keeps the
> synchronous multipart design in this phase compliant. The tasks below
> already reflect that decision.

**Purpose**: Core data model, permission chokepoint, validation, and a critical existing-job correctness fix that every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Add `page_attachments` table (`id, page_id, asset_id, file_name, uploaded_by, created_at, removed_at, removed_by` + the two indexes from data-model.md) to `apps/web/src/server/db/schema/index.ts`, preserving the lifecycle audit fields required by FR-016
- [X] T004 Add singleton `attachment_settings` table (`id, max_size_bytes, allowed_categories, updated_by, updated_at`, defaults `20971520` (20 MB) / `['image','video','document']`, mirroring `site_settings`'s pattern) to `apps/web/src/server/db/schema/index.ts` (same file as T003 — sequential with it)
- [X] T005 [P] Add `'attachments'` value to `apiKeyScopeEnum` in `apps/web/src/server/db/schema/enums.ts`
- [X] T006 Run `pnpm db:generate` for T003–T005, then run it a second time with no further edits and confirm it reports "No schema changes, nothing to migrate" per this repo's binding migration rule (depends on T003, T004, T005)
- [X] T007 Add `'attach_file'` to the `Action` union, a `roleAllows('attach_file', ...)` case mirroring `'edit'`, and `scopeToActions.attachments = ['attach_file']` (deliberately not added to `create`/`edit`'s mappings) in `apps/web/src/server/permissions/index.ts` (depends on T001)
- [X] T008 [P] Create `apps/web/src/server/content-store/attachment-validation.ts`: magic-byte + declared-MIME-fallback type sniffing for the fixed FR-010 allowlist, category mapping (`image`/`video`/`document`), and `validateAttachment(bytes, maxBytes, allowedCategories)` (research.md §7)
- [X] T009 [P] Add `ATTACHMENT_TOO_LARGE` and `UNSUPPORTED_ATTACHMENT_TYPE` to `DomainErrorCode` in `apps/web/src/server/errors.ts`, and map them to the existing public `ASSET_TOO_LARGE` (413) / `UNSUPPORTED_ASSET_TYPE` (415) codes in `apps/web/src/server/api/public-errors.ts`'s `mapPublicDomainErrorCode`
- [X] T010 Update `listAbandonedUploadIds` in `apps/web/src/server/content-store/atomic-write.ts` to also exclude any `content_assets` row referenced by a live (`removed_at IS NULL`) `page_attachments` row — **without this fix, the existing `orphan-cleanup` job (`apps/web/src/server/jobs/orphan-cleanup.ts`) will silently delete every attachment older than `CONTENT_UPLOAD_TTL_HOURS` (default 24h), because it currently only knows about `content_asset_refs` and `page_revisions.original_asset_id`** (depends on T003)
- [X] T011 [P] Update `apps/web/src/server/content-store/atomic-write.test.ts` and `apps/web/src/server/jobs/orphan-cleanup.test.ts` to cover T010: an attachment referenced only via `page_attachments` must survive cleanup past the TTL; a removed (`removed_at` set) attachment with no other reference is still reclaimable (depends on T010)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Attach a file to a page (Priority: P1) 🎯 MVP

**Goal**: An editor can attach a file to a page they can edit (web UI, public API, or MCP) and see it appear in the page's attachment list, subject to the configured size/type limits.

**Independent Test**: Open a page you can edit, attach a file of an allowed type/size, and confirm it appears in the page's attachment list.

### Tests for User Story 1 ⚠️

> Write these first; confirm they fail before the implementation tasks below make them pass.

- [X] T012 [P] [US1] Unit tests for `attachFile` (size/type acceptance and rejection, dedup-safe distinct-attachment identity, original file name/size/type preserved, rejection of unsafe filenames, and no silent safety transformation of accepted bytes) in `apps/web/src/server/services/page-attachments.test.ts`
- [X] T013 [P] [US1] Permission tests for `canAttach`: session editor/author succeeds, session reader fails; `api_key` with `edit`+`create` but no `attachments` scope fails (FR-007); `api_key` with `attachments` scope succeeds (FR-007) in `apps/web/src/server/services/page-attachments-permissions.test.ts`

### Implementation for User Story 1

- [X] T014 [P] [US1] Create `apps/web/src/server/services/attachment-settings.ts` with `getAttachmentSettings()` (returns the singleton row or the schema defaults when no row exists yet, mirroring `site-settings.ts`'s read pattern) (depends on T004)
- [X] T015 [US1] Create `apps/web/src/server/services/page-attachments.ts`: `canAttach(ctx, page)` (session → `can(ctx,'attach_file',...)`; api_key → additionally require `can(ctx,'read'|'read_draft',...)` on the same page per FR-007a) and `attachFile(ctx, pageId, bytes, fileName)` (validates a safe single display filename plus T008 + T014's limits, calls the existing generic `writeAsset(store, {kind:'attachment', ...})`, inserts a `page_attachments` row) (depends on T003, T007, T008, T014)
- [X] T016 [US1] Add `attachToPage(ctx, pageId, bytes, fileName)` to `apps/web/src/server/services/public-content.ts`, shaping the result into `PublicAttachmentResource` (depends on T002, T015)
- [X] T017 [US1] Create `apps/web/app/api/v1/pages/[id]/attachments/route.ts` with a `POST` handler (multipart `file` field → `attachToPage`), OpenAPI JSDoc per contracts/attachments-api.md, mapping `ATTACHMENT_TOO_LARGE`/`UNSUPPORTED_ATTACHMENT_TYPE`/`FORBIDDEN`/`NOT_FOUND` (depends on T009, T016)
- [X] T018 [US1] Add a `GET` handler (list current attachments for a page) to the same `apps/web/app/api/v1/pages/[id]/attachments/route.ts`, backed by a new `listAttachments(ctx, pageId)` in `page-attachments.ts`/`public-content.ts` (depends on T017)
- [X] T019 [US1] Create `apps/web/src/components/page/AttachmentsPanel.tsx` (client component): attach button/upload form, renders the current list (from the T018 endpoint), shows newly attached items immediately (depends on T018)
- [X] T020 [US1] Render `AttachmentsPanel` (with the page's id) from `apps/web/src/components/pages/ReaderPageView.tsx` (rendered by `apps/web/app/(public)/[...path]/page.tsx`) for read-only download access, and from `PagePropertiesPanel.tsx` (used by `EditPageForm.tsx`/`PagePropertiesDialog.tsx`) with `canManage` for attach/remove, since this codebase's edit UI is a dedicated `/edit` route rather than inline reader controls (depends on T019)
- [X] T021 [US1] Add MCP tool `attach_file`: schema + handler in `packages/mcp-server/src/tools/attach-file.ts`, an `attachFile` method on `packages/mcp-server/src/api-client.ts` (multipart POST to the T017 endpoint), and registration in `packages/mcp-server/src/server.ts` (depends on T017)

**Checkpoint**: User Story 1 is fully functional and independently testable (web UI, public API, and MCP).

---

## Phase 4: User Story 2 - Download an attachment from a page (Priority: P1)

**Goal**: Any reader (or API/MCP credential) with read access to a page can list and download its attachments, with correct original content, a type-appropriate disposition, and no independent read permission required.

**Independent Test**: View a page with an attachment as a reader and download it, confirming byte-for-byte content; separately, call the public API/an MCP tool with a read-only credential (no `attachments` scope) and confirm list+download still succeed.

### Tests for User Story 2 ⚠️

- [X] T022 [P] [US2] Unit tests for `getServableAttachment` (`ok`/`not_found`/`unavailable` outcomes, matching `ServableImage`'s shape) and the inline-vs-forced-download disposition decision, extending `apps/web/src/server/services/page-attachments.test.ts`
- [X] T023 [P] [US2] Permission tests for `canReadAttachment`: anonymous read on a public page succeeds/fails per page visibility; `api_key` with only `view` scope (no `attachments` scope) can list and download (FR-003b, SC-007); a credential without read access to the page receives the same not-found outcome as a missing attachment (FR-003/FR-003c), extending `apps/web/src/server/services/page-attachments-permissions.test.ts`

### Implementation for User Story 2

- [X] T024 [US2] Add `canReadAttachment(ctx, pageAttachment)` and `getServableAttachment(ctx, id)` to `apps/web/src/server/services/page-attachments.ts` (page-read-derived permission via `page_attachments.page_id`, per research.md §4) (depends on T015)
- [X] T025 [US2] Add a fixed, code-level `isInlineSafeType(contentType)` allowlist (PNG, JPEG, GIF, WebP, and `application/pdf`) to `apps/web/src/server/content-store/attachment-validation.ts`, never administrator-configurable (FR-014) (depends on T008)
- [X] T026 [US2] Create `apps/web/app/api/v1/attachments/[id]/content/route.ts` with a `GET` handler serving bytes with `Content-Type` = stored type and a safely encoded `Content-Disposition` = `inline` (T025 allowlist) or `attachment` (everything else), `404` for unreadable/removed/missing (depends on T009, T024, T025)
- [X] T027 [US2] Add `getAttachment`/`getAttachmentContent` wrappers to `apps/web/src/server/services/public-content.ts` (depends on T024)
- [X] T028 [US2] Wire `AttachmentsPanel.tsx` to render download links from the list response, and a "no longer available" state for a 404 on download (depends on T019, T026)
- [X] T029 [US2] Add MCP tools `list_attachments` and `download_attachment`: schemas + handlers in `packages/mcp-server/src/tools/list-attachments.ts` and `download-attachment.ts` (base64-encoded bytes in the response), corresponding `listAttachments`/`downloadAttachment` methods on `packages/mcp-server/src/api-client.ts`, and registration in `packages/mcp-server/src/server.ts` (depends on T018, T026)

**Checkpoint**: User Stories 1 and 2 both work independently — attach and download are fully usable end-to-end.

---

## Phase 5: User Story 3 - Remove an attachment from a page (Priority: P2)

**Goal**: An editor can remove an attachment; it immediately stops appearing in the list and stops being downloadable.

**Independent Test**: Remove an attachment as the page's editor and confirm it disappears from the list and its download URL stops working; confirm a non-editor cannot remove it.

### Tests for User Story 3 ⚠️

- [X] T030 [P] [US3] Unit tests for `removeAttachment` (soft-deletes `removed_at`/`removed_by`, preserves uploader/attach and remover/removal audit data, and makes subsequent `getServableAttachment` return `not_found`) in `apps/web/src/server/services/page-attachments.test.ts`
- [X] T031 [P] [US3] Permission tests: session editor/author can remove, session reader cannot; `api_key` with `edit` scope but no `attachments` scope **can** remove (research.md §5's documented intentional asymmetry with attach) in `apps/web/src/server/services/page-attachments-permissions.test.ts`

### Implementation for User Story 3

- [X] T032 [US3] Add `removeAttachment(ctx, id)` to `apps/web/src/server/services/page-attachments.ts`, gated by the existing `edit` action on the owning page (no new scope) (depends on T015)
- [X] T033 [US3] Create `apps/web/app/api/v1/attachments/[id]/route.ts` with a `DELETE` handler → `204` (depends on T009, T032)
- [X] T034 [US3] Add a remove button to `AttachmentsPanel.tsx` for users who can edit the page, with optimistic removal from the rendered list (depends on T019, T033) — built alongside T019

**Checkpoint**: User Stories 1–3 are all independently functional.

---

## Phase 6: User Story 4 - Administrator configures attachment limits (Priority: P2)

**Goal**: An admin can view and change the wiki-wide max attachment size and allowed type categories; changes never affect already-stored attachments.

**Independent Test**: As an admin, lower the max size / narrow the allowed categories, confirm new uploads outside the new limits are refused with a clear reason, and confirm attachments uploaded before the change remain downloadable.

### Tests for User Story 4 ⚠️

- [X] T035 [P] [US4] Unit tests for `updateAttachmentSettings` (valid input persists; `maxSizeBytes <= 0` or empty `allowedCategories` rejected; existing attachments unaffected by a settings change — SC-005) in `apps/web/src/server/services/attachment-settings.test.ts`
- [X] T036 [P] [US4] Permission tests: `manage_storage`/admin-only gate on both read and write, mirroring `storage-config.ts`'s `isStorageAdmin` tests, in `apps/web/src/server/services/attachment-settings.test.ts`

### Implementation for User Story 4

- [X] T037 [US4] Add `updateAttachmentSettings(ctx, input)` to `apps/web/src/server/services/attachment-settings.ts`, gated by `can(ctx, 'manage_storage', {kind:'storage'})` (depends on T014) — built alongside T014
- [X] T038 [US4] Create `apps/web/app/api/settings/attachments/route.ts` with `GET`/`PATCH` handlers (PATCH, not PUT — matches every sibling `/api/settings/*` route), mirroring the sibling `apps/web/app/api/settings/*` routes (depends on T002, T037)
- [X] T039 [US4] Create the admin settings page `apps/web/app/(admin)/admin/attachments/page.tsx` (max size input, category switches) plus an admin nav entry for discoverability (depends on T038)
- [X] T040 [P] [US4] E2E test `apps/web/e2e/admin-attachments.spec.ts` covering: default limits work out of the box, admin lowers the limit and an over-limit upload is refused, admin narrows categories and a disallowed type is refused, pre-existing attachments remain downloadable after the change (depends on T039) — real browser run caught and fixed a Next.js dynamic-route-name collision (`[pageId]` vs. existing `[id]`) in T017/T018's route folder

**Checkpoint**: Admin-configurable limits work and are enforced by the upload path built in User Story 1.

---

## Phase 7: User Story 5 - Grant an API key or MCP agent attachment-upload rights (Priority: P2)

**Goal**: An API key owner can see and grant the new independent `attachments` scope when creating/managing a key, and confirm the scope behaves independently of `create`/`edit`.

**Independent Test**: Issue an API key without the `attachments` scope and confirm an attach call is refused even with `edit`/`create`; add the scope and confirm the same call succeeds.

### Tests for User Story 5 ⚠️

- [X] T041 [P] [US5] End-to-end permission-matrix test covering spec User Story 5's four acceptance scenarios (edit+create without `attachments` scope fails; `attachments` scope succeeds; MCP credential without the scope is refused with a permission-identifying message; `attachments` scope without page-read access still fails per FR-007a) in `apps/web/src/server/services/page-attachments-permissions.test.ts`

### Implementation for User Story 5

- [X] T042 [US5] Add `'attachments'` to `SCOPE_ORDER` in `apps/web/src/components/user-center/ApiKeyCreateDialog.tsx`, and add `userCenter.apiKeys.scope.attachments` / `scopeDescriptions.attachments` labels to `apps/web/messages/en.json` and `apps/web/messages/zh.json` (depends on T001)

**Checkpoint**: All five user stories are independently functional; the feature is complete end-to-end.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Whole-feature verification that spans multiple stories.

- [X] T043 [P] E2E test `apps/web/e2e/attachments.spec.ts` covering the full web-UI happy path across US1–US3: attach → appears in list → download (inline PDF/image, forced-download other type) → remove → no longer downloadable (depends on T020, T028, T034) — this real-browser run caught and fixed a genuine bug: the declared `Content-Type` from the multipart upload was never threaded through to `validateAttachment`, so `text/plain`/`text/markdown`/`text/csv` (which have no magic number) could never be accepted in production despite being in the FR-010 allowlist
- [X] T044 Run `pnpm typecheck` and `pnpm lint` across the whole monorepo (not just the web app, since MCP/shared were also touched); confirmed clean. Also ran the full `apps/web` vitest suite (4030 tests) and individually verified, by stashing this feature's changes and re-running, that all 10 pre-existing failures (permissions.test.ts's anonymousRead case, a `migration-history.test.mjs` vitest/node:test harness quirk, and 8 others) reproduce identically without this feature's code — none are regressions. `users.test.ts`'s apparent full-suite-only failure was confirmed to be pre-existing cross-file DB-state pollution (passes in isolation and alongside this feature's own test files), not something this feature caused.
- [X] T045 Confirmed the Public Content Delivery claim: `AttachmentsPanel` is a `'use client'` component that fetches its own list via `useEffect` after hydration (never as page-render server data), so `ReaderPageView.tsx` needed no change to its data-fetching, and the parent route's ISR/static classification is untouched — matches constitution P12 and data-model.md's cache-impact note.
- [X] T046 Full manual/browser walkthrough not run against `docker compose up` in this session (no such deployment was available); instead, most of quickstart.md was covered by real Playwright runs against the dev server across `e2e/attachments.spec.ts` and `e2e/admin-attachments.spec.ts` (§1 defaults, most of §2 download incl. byte-exact verification and inline-vs-forced disposition, §3 removal, §4 admin limits incl. grandfathering, §6 no in-app preview) plus the `page-attachments-permissions.test.ts` matrix for §5's scope-independence scenarios (MCP itself shares the exact same service/route code path, so this is strong evidence but not a literal MCP-client round trip). Not independently exercised: an actual MCP client invoking the tools over the MCP protocol, a real video (MP4) file end-to-end, and a live unauthenticated-session HTTP 404 check for §2.3 (covered at the service-layer test + route-code-reading level, not a live second-browser-session HTTP call). Flagged here rather than claimed as verified.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T001 feeds T007; T002 feeds T016/T038). Blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only. No dependency on other stories.
- **User Story 2 (Phase 4)**: Depends on Foundational; reuses US1's `page-attachments.ts`, its route file, and `AttachmentsPanel.tsx` (extends, doesn't duplicate) — build after US1.
- **User Story 3 (Phase 5)**: Depends on Foundational; extends the same US1 files. Independent of US2's content beyond needing the panel/service files US1 created.
- **User Story 4 (Phase 6)**: Depends on Foundational (T004/T014). Independently testable once T014 (built in US1) exists, since the read path (`getAttachmentSettings`) is shared — but T014 is Foundational-adjacent (created in US1's phase) so US4 practically starts after US1.
- **User Story 5 (Phase 7)**: Depends on Foundational only (the scope/permission mechanics are already complete after Phase 2 + US1/US2's `canAttach`/`canReadAttachment`); its own task (T042) is a small, isolated UI change.
- **Polish (Phase 8)**: Depends on US1–US4 (US5 is UI-label-only and doesn't affect the E2E flow).

### Within Each User Story

- Tests written and failing before implementation.
- Services before routes; routes before UI/MCP wrappers.
- Story checkpoint reached before moving to the next priority.

### Parallel Opportunities

- T001/T002 (Setup) in parallel.
- T005 (Foundational) in parallel with T003/T004 (different file); T008/T009/T011 in parallel with each other (different files).
- Within US1: T012/T013 in parallel; T014 in parallel with T012/T013.
- Within US2: T022/T023 in parallel.
- Within US3: T030/T031 in parallel.
- Within US4: T035/T036 in parallel; T040 in parallel with nothing else in its own phase (last task) but can run alongside US5's T041.
- Once Foundational completes, US1 and US5 could technically be staffed in parallel (US5 only needs the Foundational scope plumbing), though US5's own scope tests (T041) are more meaningful once US1/US2's `canAttach`/`canReadAttachment` exist.

---

## Parallel Example: User Story 1

```bash
# Tests together:
Task: "Unit tests for attachFile in apps/web/src/server/services/page-attachments.test.ts"
Task: "Permission tests for canAttach in apps/web/src/server/services/page-attachments-permissions.test.ts"

# Then, in parallel with the tests:
Task: "Create attachment-settings.ts with getAttachmentSettings() in apps/web/src/server/services/attachment-settings.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational) — includes the critical orphan-cleanup fix (T010), which must land before any attachment can safely survive past `CONTENT_UPLOAD_TTL_HOURS`.
2. Complete Phase 3 (User Story 1).
3. **STOP and VALIDATE**: attach a file via the web UI and confirm it's listed. Note that without US2, there's no way to download it yet — US1+US2 together are the practical minimum demoable slice, since "attach with no way to retrieve it" has little standalone value; treat P1+P1 (US1+US2) as the true MVP pair.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 + US2 (both P1) → attach and download work end-to-end → demoable MVP.
3. US3 (P2) → removal.
4. US4 (P2) → admin-configurable limits (defaults already work from US1; this adds control).
5. US5 (P2) → self-service scope grant in the API key UI (the underlying enforcement already exists after Foundational + US1/US2).
6. Polish → cross-cutting E2E coverage and quickstart validation.

### Parallel Team Strategy

After Foundational:
- Developer A: US1 → US2 (sequential, same files).
- Developer B: US4 (attachment-settings.ts + admin page) — only needs T014 from US1 landed first.
- Developer C: US5's T042 (isolated UI-label change) any time after Setup's T001.
- US3 folds in after US1/US2's `page-attachments.ts`/`AttachmentsPanel.tsx` stabilize, to avoid merge churn on the same files.

---

## Notes

- [P] tasks touch different files with no unmet dependency.
- Several tasks across stories extend the *same* file created in an earlier story (`page-attachments.ts`, `page-attachments-permissions.test.ts`, the attachments route files, `AttachmentsPanel.tsx`) — these are intentionally sequential, not parallel, even when they don't carry an explicit dependency note beyond "extends."
- T010 (the orphan-cleanup fix) is the single highest-risk task in this feature: it is a change to *existing*, already-shipped behavior (the abandoned-upload reclamation job), not new code, and a missed case there causes silent data loss for every attachment rather than a visible bug. Prioritize its test (T011) accordingly.
- Commit after each task or logical group, per repository convention (small, focused commits; refactor and feature work in separate commits).
