# Tasks: Unified UI Localization

**Input**: Design documents from `/specs/016-next-intl-migration/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md),
[research.md](./research.md), [data-model.md](./data-model.md), and
[contracts/ui-localization.md](./contracts/ui-localization.md)

**Tests**: Required by the specification's measurable outcomes and
[quickstart.md](./quickstart.md): catalog/type validation, locale resolver
coverage, component tests, Playwright language-preference flows, and public
ISR/URL regression coverage.

**Organization**: Tasks are grouped by user story. All UI locale work is kept
separate from the existing AI content-translation domain and its `/{locale}`
reader URLs.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can be worked in parallel after its stated dependencies complete.
- **[Story]**: Maps a task to a user story in [spec.md](./spec.md).
- Every task includes an exact file path or bounded file glob.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the approved dependencies and establish the intended source
locations without adding UI locale routing.

- [ ] T001 Add `next-intl` and `@formatjs/intl-localematcher` to `apps/web/package.json` and update `pnpm-lock.yaml` without adding routing middleware dependencies.
- [ ] T002 Create the UI catalog directory and migrate-safe source placeholders at `apps/web/messages/en.json`, `apps/web/messages/zh.json`, and `apps/web/src/i18n/`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish one typed UI locale model, next-intl integration, and
safe rendering boundaries before any story-specific migration.

**⚠️ CRITICAL**: Do not start a user-story phase until this phase is complete.

- [ ] T003 Define the finite `UiLocale`, default locale, legacy cookie name, validation helpers, and static-public locale policy in `apps/web/src/i18n/config.ts`.
- [ ] T004 Implement and unit-test the shared dynamic locale resolver (persisted preference → validated cookie → weighted `Accept-Language` → `en`) in `apps/web/src/i18n/resolve.ts` and `apps/web/src/i18n/resolve.test.ts`.
- [ ] T005 Configure the next-intl plugin, request configuration, typed `AppConfig`, and named format presets in `apps/web/next.config.ts`, `apps/web/src/i18n/request.ts`, `apps/web/src/i18n/types.ts`, and `apps/web/src/i18n/formats.ts` without `defineRouting`, locale middleware, or URL rewrites.
- [ ] T006 Convert the existing flat English and Chinese dictionaries into matching namespaced message catalogs in `apps/web/messages/en.json` and `apps/web/messages/zh.json`, preserving every current key before any ICU enhancement.
- [ ] T007 Add shared next-intl render helpers and replace old-provider test setup in `apps/web/test/i18n-test-utils.tsx`, `apps/web/src/components/editor/PagePropertiesFields.test.tsx`, `apps/web/src/components/admin/tags/TagManager.test.tsx`, and `apps/web/src/components/ui/Pagination.test.tsx`.
- [ ] T008 Introduce explicit dynamic-application and cache-safe-public provider boundaries in `apps/web/src/components/i18n/ApplicationI18nProvider.tsx`, `apps/web/src/components/i18n/PublicI18nBoundary.tsx`, and `apps/web/app/layout.tsx`.
- [ ] T009 Add regression coverage for the no-UI-locale-routing contract in `apps/web/src/i18n/routing-contract.test.ts` and `apps/web/proxy.ts`, proving the audit proxy is not repurposed for locale routing.

**Checkpoint**: The application has one validated UI locale model, only the
active language catalog is selected for dynamic UI, and no route owns a new UI
locale prefix.

---

## Phase 3: User Story 1 - Use One Consistent Interface Language (Priority: P1) 🎯 MVP

**Goal**: A visitor can view English or Chinese consistently across dynamic UI
surfaces, with correctly formatted values, localized errors, and no legacy
provider remaining in migrated screens.

**Independent Test**: With a browser language/cookie selecting each supported
locale, open representative auth, user, editor, admin, search, and reader
screens; trigger validation/loading/error states and confirm all tested text,
accessibility labels, dates, and numbers use one locale.

### Tests for User Story 1

- [ ] T010 [P] [US1] Add ICU interpolation, plural/select, rich-message, date, number, and relative-time unit cases in `apps/web/src/i18n/messages.test.ts` and `apps/web/src/i18n/formats.test.ts`.
- [ ] T011 [P] [US1] Add component-level locale-change and fallback assertions for representative shared controls in `apps/web/src/components/i18n/LanguageSwitcher.test.tsx`, `apps/web/src/components/ui/ConfirmDialog.test.tsx`, and `apps/web/src/components/layout/Header.test.tsx`.

### Implementation for User Story 1

- [ ] T012 [US1] Replace custom server dictionary calls with `getTranslations` and server formatter helpers across `apps/web/app/(admin)/admin/**/*.tsx`, `apps/web/app/(user)/user-center/**/*.tsx`, `apps/web/app/auth/**/*.tsx`, `apps/web/app/api-docs/page.tsx`, `apps/web/app/setup/page.tsx`, `apps/web/app/forbidden/page.tsx`, and `apps/web/app/not-found.tsx`.
- [ ] T013 [US1] Replace custom client translation consumers with next-intl hooks across `apps/web/src/components/{admin,appearance,auth,chat,editor,layout,pages,search,theme,ui,user-center}/**/*.tsx` while preserving each component's existing props and UI behavior.
- [ ] T014 [US1] Migrate `apps/web/src/components/renderer/CodeBlock.tsx` and `apps/web/src/components/renderer/MermaidBlock.tsx` to the new message and formatter APIs without assuming they inherit the old context.
- [ ] T015 [US1] Replace user-visible raw English labels and raw server-error message rendering with localized keys and a stable error-code mapper in `apps/web/src/i18n/error-messages.ts`, `apps/web/src/components/{auth,pages,admin,user-center}/**/*.tsx`, `apps/web/app/(public)/search/page.tsx`, and `apps/web/app/(admin)/admin/users/[id]/ai/page.tsx`.
- [ ] T016 [US1] Replace unscoped `toLocaleString`/`toLocaleDateString` output with registered next-intl formatters in `apps/web/src/components/{admin,user-center}/**/*.tsx` and `apps/web/app/(public)/{page.tsx,pages/page.tsx,tags/[name]/page.tsx,revisions/[n]/[...path]/page.tsx,history/[...path]/page.tsx}`.
- [ ] T017 [US1] Add end-to-end locale coverage for representative public, authentication, user-center, editor, administrator, search, validation, loading, and error flows in `apps/web/e2e/localization.spec.ts`.

**Checkpoint**: The MVP delivers a consistent translated UI for the selected
browser/cookie locale without requiring account-preference persistence.

---

## Phase 4: User Story 2 - Keep a Language Preference Across Visits and Devices (Priority: P1)

**Goal**: A signed-in user's persisted preference reliably wins over browser
signals, language changes refresh server/client output, and failed saves are
not misrepresented as successful.

**Independent Test**: Save `en` and `zh` in the profile on separate sessions
with conflicting cookies; on the first authenticated screen, confirm the saved
choice controls `<html lang>`, dynamic metadata, server text, and client text.

### Tests for User Story 2

- [ ] T018 [P] [US2] Add precedence, invalid-legacy-value, cookie, and persisted-preference service/route tests in `apps/web/src/i18n/resolve.test.ts`, `apps/web/src/server/services/user-center.test.ts`, and `apps/web/app/api/user/preferences/route.test.ts`.

### Implementation for User Story 2

- [ ] T019 [US2] Implement validated locale persistence and cookie writing with localized failure results in `apps/web/src/i18n/actions.ts`, `apps/web/app/api/user/preferences/route.ts`, and `apps/web/src/server/services/user-center.ts`, keeping the existing preference response schema unchanged.
- [ ] T020 [US2] Make the header switcher and profile preference form wait for the authoritative preference result, refresh the route, and restore/report failures in `apps/web/src/components/i18n/LanguageSwitcher.tsx` and `apps/web/src/components/user-center/ProfileForm.tsx`.
- [ ] T021 [US2] Apply the shared resolver to dynamic document language and metadata in `apps/web/app/layout.tsx`, `apps/web/app/(user)/user-center/layout.tsx`, and dynamic page metadata helpers under `apps/web/app/{(admin),(user),auth}/**/*.tsx`.
- [ ] T022 [US2] Add authenticated preference persistence, conflicting-cookie, refresh, and failed-save Playwright scenarios in `apps/web/e2e/localization.spec.ts` and `apps/web/e2e/user-center.spec.ts`.

**Checkpoint**: Saved preferences are cross-session authoritative for dynamic
authenticated UI, and changing language cannot leave stale server/client text.

---

## Phase 5: User Story 3 - Read Localized Content Without URL Ambiguity (Priority: P1)

**Goal**: UI localization never changes document identity or compromises the
public reader's static/ISR cache contract; existing original and translated
bookmarks retain their meaning.

**Independent Test**: Request `/guide` and `/zh/guide` with conflicting UI
cookies and browser headers; each address retains its original/translation
content identity, canonical URL, hreflang, and cache-safe public metadata.

### Tests for User Story 3

- [ ] T023 [P] [US3] Extend original-versus-translation route and public-cache regressions in `apps/web/src/server/jobs/translation.test.ts`, `apps/web/src/server/services/public-content-read.test.ts`, and `apps/web/src/lib/path.test.ts` for conflicting UI locale signals.
- [ ] T024 [P] [US3] Add Playwright public-reader assertions for unchanged URLs, canonical metadata, reader content identity, and no UI-preference cache invalidation in `apps/web/e2e/localization.spec.ts` and `apps/web/e2e/public-wiki-api-equivalence.spec.ts`.

### Implementation for User Story 3

- [ ] T025 [US3] Refactor the public route-group layout and root document boundary so cookie/header/database locale resolution cannot execute while rendering the static reader in `apps/web/app/layout.tsx`, `apps/web/app/(public)/layout.tsx`, and `apps/web/src/components/layout/Layout.tsx`.
- [ ] T026 [US3] Remove request-dependent UI translations from static reader document/SEO output and provide cache-safe defaults or client-only personalized controls in `apps/web/app/(public)/[...path]/page.tsx`, `apps/web/app/(public)/page.tsx`, `apps/web/app/(public)/pages/page.tsx`, and `apps/web/app/(public)/tags/[name]/page.tsx`.
- [ ] T027 [US3] Propagate the current client UI locale into independently mounted renderer islands and rerender them after a locale change in `apps/web/src/components/renderer/ContentRenderer.tsx`, `apps/web/src/components/renderer/CodeBlock.tsx`, and `apps/web/src/components/renderer/MermaidBlock.tsx`.
- [ ] T028 [US3] Verify `apps/web/src/server/cache/public-cache.ts`, `apps/web/src/server/services/pages.ts`, and `apps/web/src/server/services/revisions.ts` retain existing content-mutation invalidation while UI preference writes invoke none.

**Checkpoint**: Published reader documents remain static/ISR, content
translation routing is unchanged, and personalized UI localization is outside
the shared document representation.

---

## Phase 6: User Story 4 - Safely Expand and Maintain Interface Languages (Priority: P2)

**Goal**: Maintainers can safely evolve UI catalogs and formatting with
deterministic validation, typed keys/forms, and no hidden dependency on the
retired runtime.

**Independent Test**: Deliberately introduce a missing catalog entry and an
incompatible message variable/form; release validation fails. Restore both and
confirm every catalog/type/import check passes.

### Tests for User Story 4

- [ ] T029 [P] [US4] Add failing-fixture coverage for missing message keys, incompatible ICU values/forms, fallback behavior, and unknown locale values in `apps/web/src/i18n/catalog-validation.test.ts` and `apps/web/src/i18n/messages.test.ts`.

### Implementation for User Story 4

- [ ] T030 [US4] Implement a catalog completeness/compatibility validator and package command in `apps/web/scripts/validate-i18n.mjs` and `apps/web/package.json`.
- [ ] T031 [US4] Complete next-intl type augmentation and catalog-format registration in `apps/web/src/i18n/types.ts`, `apps/web/src/i18n/formats.ts`, `apps/web/messages/en.json`, and `apps/web/messages/zh.json` so future UI locales have one validated extension path.
- [ ] T032 [US4] Remove the retired custom provider, hand-written dictionary lookup/interpolator, flat TypeScript dictionaries, and obsolete tests from `apps/web/src/i18n/client.tsx`, `apps/web/src/i18n/server.ts`, `apps/web/src/i18n/utils.ts`, and `apps/web/src/i18n/locales/{en,zh}.ts`; retain only next-intl augmentation in `apps/web/src/i18n/types.ts` after confirming no imports remain.
- [ ] T033 [US4] Document catalog ownership, UI-versus-content locale separation, and the no-routing rule in `apps/web/README.md` and `docs/architecture/mandates.md`.

**Checkpoint**: Catalog validation blocks incomplete localization releases, and
the repository has one UI localization runtime with an explicit future-language
extension path.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Complete end-to-end verification, remove migration residue, and
confirm the public delivery and navigation contracts.

- [ ] T034 [P] Run the UI locale import/key audit and remove dead compatibility exports in `apps/web/src/i18n/` and `apps/web/src/components/i18n/`.
- [ ] T035 [P] Run type, catalog, and unit verification using `apps/web/package.json` scripts and record any required fixes in `specs/016-next-intl-migration/quickstart.md`.
- [ ] T036 [P] Run production-build and static public-reader checks from `apps/web/next.config.ts` and `apps/web/app/(public)/[...path]/page.tsx`, confirming no cookie/header-dependent ISR regression.
- [ ] T037 [P] Run the complete Playwright regression suite from `apps/web/playwright.config.ts`, including `apps/web/e2e/localization.spec.ts` and existing translation/public-reader scenarios.
- [ ] T038 Run every scenario in `specs/016-next-intl-migration/quickstart.md` and reconcile implementation evidence with success criteria SC-001 through SC-006 in `specs/016-next-intl-migration/spec.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies.
- **Phase 2 (Foundational)**: Depends on T001–T002 and blocks every user
  story. It establishes the finite UI-locale model and explicit provider
  boundaries.
- **US1 (Phase 3)**: Depends on Phase 2. It is the MVP and validates current
  bilingual UI coverage on dynamic surfaces.
- **US2 (Phase 4)**: Depends on Phase 2; schedule after US1 in a single-team
  implementation because both touch the application layout and switcher.
- **US3 (Phase 5)**: Depends on Phase 2; it may proceed alongside US1/US2 only
  when ownership of `apps/web/app/layout.tsx` is coordinated. It must complete
  before Polish.
- **US4 (Phase 6)**: Depends on US1–US3 so validation covers the final catalog
  and the old runtime is removed only after all consumers migrate.
- **Phase 7 (Polish)**: Depends on all selected user-story phases.

### User Story Dependency Graph

```text
Setup → Foundation ─┬→ US1: Consistent UI language → US2: Persisted preference
                   ├→ US3: Static reader and URL invariance
                   └────────────────────────────────────────→ US4: Catalog maintenance
US2 + US3 + US4 → Polish and full regression validation
```

### Parallel Opportunities

- T004 and T009 can proceed in parallel once T003 establishes the locale
  registry; T006 and T007 can proceed after the message source structure exists.
- T010 and T011 are independent test files; T013 and T016 touch separate
  client/server component groups after the shared provider is ready.
- T018 can be prepared independently of US1 component migration; T023 and T024
  are independent public-reader test suites.
- T029 can be prepared while the remaining implementation is finishing; T034
  through T037 can run in parallel once all story checkpoints pass.

## Parallel Examples

### User Story 1

```text
Task: "Add ICU and formatter tests in apps/web/src/i18n/messages.test.ts and apps/web/src/i18n/formats.test.ts"
Task: "Add locale component tests in apps/web/src/components/i18n/LanguageSwitcher.test.tsx, apps/web/src/components/ui/ConfirmDialog.test.tsx, and apps/web/src/components/layout/Header.test.tsx"
```

### User Story 3

```text
Task: "Extend content-translation/cache regression tests in apps/web/src/server/jobs/translation.test.ts, apps/web/src/server/services/public-content-read.test.ts, and apps/web/src/lib/path.test.ts"
Task: "Add public reader Playwright checks in apps/web/e2e/localization.spec.ts and apps/web/e2e/public-wiki-api-equivalence.spec.ts"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete T010–T017 for consistent bilingual dynamic UI behavior.
3. Run the US1 independent tests and demonstrate English/Chinese across the
   representative screens.
4. Do not remove the compatibility boundary until the other stories' public
   cache and preference tests are ready.

### Incremental Delivery

1. Foundation → one typed, no-routing UI localization platform.
2. US1 → consistently localized current screens and formatting.
3. US2 → reliable account-level preference persistence and refresh behavior.
4. US3 → verified public-reader ISR and content-translation URL invariance.
5. US4 → release-gated catalog maintenance and removal of the legacy runtime.
6. Polish → full quickstart and regression validation.

## Notes

- `[P]` means the listed files do not overlap with another unfinished task; it
  does not waive the phase dependencies above.
- No database migration, public API schema expansion, content-language change,
  or UI locale URL route is authorized by this task list.
- Do not call public-content cache invalidation for UI preference writes.
