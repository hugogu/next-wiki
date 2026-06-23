# Tasks: Appearance & Site Configuration

**Input**: Design documents from `/specs/006-appearance-and-site-config/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — this codebase ships Vitest unit/integration and Playwright
E2E tests alongside every service (project convention); test tasks are part of
each story.

**Organization**: Tasks are grouped by user story (US1–US4) for independent
implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1–US4 (maps to spec.md user stories)
- All paths are relative to repo root.

## Path Conventions

Monorepo web app: server-only code in `apps/web/src/server/`, UI in
`apps/web/src/components/` (primitives in `ui/`), routes in `apps/web/app/`,
shared Zod in `packages/shared/src/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared assets and token scaffolding used by multiple stories.

- [X] T001 [P] Generate a default site favicon as `apps/web/public/icon.svg` (minimal wiki glyph using the brand accent), per research R7
- [X] T002 [P] Create `apps/web/src/server/appearance/tokens.ts`: canonical token-name set, default light/dark color values (mirroring current `globals.css`), and the bundled font catalog (keys → label + font stack) per research R2/R6
- [X] T003 Promote hardcoded font sizes in `apps/web/app/globals.css` (`.prose` heading sizes, base size) to CSS custom properties (`--font-size-*`) and map them in `apps/web/tailwind.config.ts` per research R2

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Authorization primitive needed by the admin-facing stories.

**⚠️ CRITICAL**: Complete before US1/US2 admin writes.

- [X] T004 Add `manage_appearance` capability to `apps/web/src/server/permissions/index.ts` (grant to admin role, no hardcoded bypass) and cover it in `apps/web/src/server/permissions/ai-permissions.test.ts` sibling test or a new `appearance-permissions.test.ts`

**Checkpoint**: Foundation ready — user stories can begin.

---

## Phase 3: User Story 1 - System-Level Appearance Configuration (Priority: P1) 🎯 MVP

**Goal**: Admin-configurable, site-wide colors/fonts/sizes (light + dark) injected at runtime with no redeploy; no hardcoded style literals in feature components.

**Independent Test**: Change primary color + body font, save, see it reflected on reader/editor/admin pages in both modes; code audit finds no raw literals.

### Tests for User Story 1

- [X] T005 [P] [US1] Unit test for appearance validation + service (valid/invalid color, unknown font key, non-positive size, full token-set coverage) in `apps/web/src/server/services/appearance-settings.test.ts`
- [X] T006 [P] [US1] E2E test: appearance change reflected across reader/editor/admin in light + dark in `apps/web/tests/e2e/appearance-settings.spec.ts`

### Implementation for User Story 1

- [X] T007 [P] [US1] Add `appearance_settings` single-row table (`light_colors`, `dark_colors`, `fonts`, `font_sizes` JSONB; `updated_by`/`updated_at`) to `apps/web/src/server/db/schema/index.ts` per data-model
- [X] T008 [US1] Run `pnpm db:generate` to produce `apps/web/src/server/db/migrations/0017_*.sql` (depends on T007)
- [X] T009 [P] [US1] Add Zod schemas (`appearanceSettingsViewSchema`, `updateAppearanceSettingsInputSchema`, color/font/size validators) in `packages/shared/src/appearance.ts` and export from `packages/shared/src/index.ts`
- [X] T010 [US1] Implement `apps/web/src/server/services/appearance-settings.ts` (read with static defaults fallback, write with validation, font-catalog check) — depends on T007, T009
- [X] T011 [US1] Implement REST `GET`/`PUT` in `apps/web/app/api/settings/appearance/route.ts` (gated by `manage_appearance`, OpenAPI annotations) per contracts/appearance-settings.md
- [X] T012 [US1] Inject configured tokens as `<style id="app-appearance">` (light `:root` + `html.dark`) with static fallback in `apps/web/app/layout.tsx` per research R1
- [X] T013 [P] [US1] Create admin token-editor page `apps/web/app/(admin)/admin/appearance/page.tsx` + `apps/web/src/components/admin/appearance/AppearanceForm.tsx` (color pickers, font select, size inputs; light + dark)
- [X] T014 [US1] Add a single "Appearance" entry to admin nav in `apps/web/src/components/layout/Navigator.tsx` (one canonical entry point)
- [X] T015 [P] [US1] Add appearance i18n strings to `apps/web/src/i18n/locales/en.ts` and `apps/web/src/i18n/locales/zh.ts`
- [X] T016 [US1] Audit feature components for raw color/font/font-size literals and replace with tokens (sweep `apps/web/src/components` + `apps/web/app`, excluding `ui/` and `globals.css`) per SC-001

**Checkpoint**: US1 fully functional — appearance configurable site-wide.

---

## Phase 4: User Story 2 - Site Identity & Footer Configuration (Priority: P2)

**Goal**: Admin-configurable site name, icon/favicon (with shipped default), footer copyright, and China ICP/公安备案 filing numbers on every page.

**Independent Test**: Set name/icon/footer/ICP; every page shows them; icon in browser tab; ICP linked to registry; cleared fields render nothing.

### Tests for User Story 2

- [X] T017 [P] [US2] Unit test for site-settings service (empty name rejected, invalid URL, icon set/clear, conditional footer fields) in `apps/web/src/server/services/site-settings.test.ts`
- [X] T018 [P] [US2] E2E test: site name → header/title; default vs uploaded icon; footer ICP link in `apps/web/tests/e2e/site-settings.spec.ts`

### Implementation for User Story 2

- [X] T019 [P] [US2] Add `site_settings` single-row table (`site_name`, `icon_asset_id`, `footer_copyright`, `icp_number`, `icp_url`, `public_security_number`, `public_security_url`, audit cols) to `apps/web/src/server/db/schema/index.ts`
- [X] T020 [US2] Run `pnpm db:generate` to produce the next migration `apps/web/src/server/db/migrations/0018_*.sql` (depends on T019)
- [X] T021 [P] [US2] Add Zod schemas (`siteSettingsViewSchema`, `updateSiteSettingsInputSchema`) in `packages/shared/src/site.ts` + export from index
- [X] T022 [US2] Implement `apps/web/src/server/services/site-settings.ts` (read public subset, write validation, icon bytes via existing content/blob store) — depends on T019, T021
- [X] T023 [US2] Implement REST `GET`/`PUT` in `apps/web/app/api/settings/site/route.ts` (gated by `manage_appearance`) per contracts/site-settings.md
- [X] T024 [US2] Implement icon routes in `apps/web/app/api/settings/site/icon/route.ts` (`GET` serve default/uploaded, `PUT` upload, `DELETE` revert)
- [X] T025 [US2] Wire site name + favicon into `generateMetadata` (title + icons) in `apps/web/app/layout.tsx` per research R7
- [X] T026 [P] [US2] Create `apps/web/src/components/ui/Footer.tsx` (always-on copyright if set; ICP/公安备案 lines only when present, linked) and mount it in the app layout
- [X] T027 [P] [US2] Create admin site-settings page `apps/web/app/(admin)/admin/appearance/site/page.tsx` + `apps/web/src/components/admin/appearance/SiteSettingsForm.tsx` (name, icon upload/preview, footer, ICP fields)
- [X] T028 [P] [US2] Add site-config i18n strings to `apps/web/src/i18n/locales/en.ts` and `zh.ts`

**Checkpoint**: US1 + US2 work independently.

---

## Phase 5: User Story 3 - Personal Markdown Reading Themes (Priority: P3)

**Goal**: Built-in (Default + Wiki.js-inspired) read-only themes plus per-user editable copies; view/copy/edit/rename/activate CSS in-app; typography-only (colors from system tokens); applied to reader + editor preview; per-user isolation.

**Independent Test**: View built-ins' CSS; copy/edit/rename/activate a personal theme; article re-renders; a second user is unaffected; sanitization strips remote url()/@import/color.

### Tests for User Story 3

- [ ] T029 [P] [US3] Unit test for CSS sanitizer (strips `@import`, remote `url()`, `color`/`background-color`; keeps typography props; re-scopes selectors) in `apps/web/src/server/appearance/css-sanitize.test.ts`
- [ ] T030 [P] [US3] Unit test for markdown-themes service (built-in read-only/copy, duplicate/empty name rejection, activate, delete-active fallback to Default, cross-user isolation) in `apps/web/src/server/services/markdown-themes.test.ts`
- [ ] T031 [P] [US3] E2E test: copy → edit → activate; second user unchanged; sanitization in `apps/web/tests/e2e/markdown-themes.spec.ts`

### Implementation for User Story 3

- [ ] T032 [P] [US3] Add `markdown_themes` table (with unique `(owner_user_id, name)`) and `users.active_markdown_theme_id` column to `apps/web/src/server/db/schema/index.ts` per data-model
- [ ] T033 [US3] Run `pnpm db:generate` to produce the next migration `apps/web/src/server/db/migrations/0019_*.sql` (depends on T032)
- [ ] T034 [P] [US3] Create built-in theme registry `apps/web/src/server/appearance/builtin-themes.ts` (Default + Wiki.js-inspired typography CSS) and seed them in `apps/web/src/server/seed/` (bounded registry, P9)
- [ ] T035 [P] [US3] Implement CSS sanitizer `apps/web/src/server/appearance/css-sanitize.ts` using `postcss` as the parser (allowlist typography properties, strip remote `url()`/`@import`/color, enforce max size) per research R5
- [ ] T036 [P] [US3] Add Zod schemas (`markdownThemeViewSchema`, create-by-copy, rename/update, activate) in `packages/shared/src/markdown-theme.ts` + export from index
- [ ] T037 [US3] Implement `apps/web/src/server/services/markdown-themes.ts` (list built-ins + own, view, copy, update via sanitizer, rename, delete with active-fallback, activate; ownership + built-in read-only enforcement) — depends on T032, T034, T035, T036
- [ ] T038 [US3] Implement REST routes `apps/web/app/api/markdown-themes/route.ts`, `apps/web/app/api/markdown-themes/[id]/route.ts`, and the activate endpoint per contracts/markdown-themes.md
- [ ] T039 [US3] Resolve the user's active theme in `apps/web/src/server/services/user-center.ts` `getPreferences` and inject the scoped active-theme `<style>` in `apps/web/app/layout.tsx` (depends on T037)
- [ ] T040 [US3] Apply the scoped theme container to the reader in `apps/web/src/components/renderer/ContentRenderer.tsx` and the editor preview (`apps/web/src/components/editor/SplitMarkdownEditor.tsx`) per research R4
- [ ] T041 [P] [US3] Create per-user Markdown themes UI: page `apps/web/app/(admin)/admin/appearance/themes/page.tsx` (+ view/edit/preview/rename/activate components in `apps/web/src/components/admin/appearance/`); editing a built-in offers "create a copy"
- [ ] T042 [P] [US3] Add Markdown-theme i18n strings to `apps/web/src/i18n/locales/en.ts` and `zh.ts`

**Checkpoint**: US1 + US2 + US3 independently functional.

---

## Phase 6: User Story 4 - Unified Pagination Navigation (Priority: P3)

**Goal**: One shared, URL-search-param-driven pagination component (first/prev/next/last) used by every list; current page in the URL; clamped invalid pages; hidden for single-page lists.

**Independent Test**: On a multi-page list, jump to last page → URL updates → refresh stays; boundaries disabled; invalid page params clamp without error; two lists share the same component.

### Tests for User Story 4

- [ ] T043 [P] [US4] Unit test for the server page-parse/clamp helper (zero/negative/non-numeric/over-last → clamped) in `apps/web/src/server/api/pagination.test.ts`
- [ ] T044 [P] [US4] Component test for `Pagination` (first/prev/next/last, disabled boundaries, hidden single-page, preserves other query params) in `apps/web/src/components/ui/Pagination.test.tsx`
- [ ] T045 [P] [US4] E2E test: page in URL survives refresh; boundary disabling; clamp; two lists identical in `apps/web/tests/e2e/pagination.spec.ts`

### Implementation for User Story 4

- [ ] T046 [P] [US4] Create server helper `apps/web/src/server/api/pagination.ts` (parse `page` search param, clamp to `[1, totalPages]`, compute offset) per contracts/pagination.md
- [ ] T047 [US4] Create shared primitive `apps/web/src/components/ui/Pagination.tsx` (search-param driven, first/prev/next/last + nearby numbers, `aria-disabled` boundaries, hidden when `totalPages <= 1`, preserves other params)
- [ ] T048 [US4] Migrate existing lists to the shared component + `page` param: transfers list (`apps/web/app/(admin)/admin/transfers/page.tsx` + `apps/web/src/components/admin/transfers/TransferRunList.tsx`), search, history, and other admin lists (api-audit, users) — remove ad-hoc/no-URL pagination
- [ ] T049 [P] [US4] Add pagination i18n strings (first/prev/next/last/page labels) to `apps/web/src/i18n/locales/en.ts` and `zh.ts`

**Checkpoint**: All four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T050 [P] Regenerate/verify OpenAPI doc (`apps/web/app/api/openapi.json` / generator) includes the new settings + markdown-theme endpoints
- [ ] T051 [P] Accessibility pass on the new admin forms and the `Pagination` control (keyboard nav, `aria-disabled`, contrast against tokens)
- [ ] T052 Run `specs/006-appearance-and-site-config/quickstart.md` validation end-to-end, then `pnpm lint` and `pnpm typecheck`; fix warnings
- [ ] T053 [P] Update `docs/architecture/` notes if token-configurability or the markdown-theme registry changes any documented invariant

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2, T004)**: after Setup; blocks US1/US2 admin writes.
- **User Stories (Phases 3–6)**: after Foundational. US1→US2→US3→US4 in priority
  order, but each is independently testable and can be parallelized across devs.
- **Polish (Phase 7)**: after the desired stories are complete.

### Story Dependencies

- **US1 (P1)**: independent (MVP).
- **US2 (P2)**: independent; reuses `manage_appearance` (T004) and layout.
- **US3 (P3)**: independent; reuses per-user preference pattern; no dependency on
  US1/US2 (colors inherit system tokens but fall back to static defaults).
- **US4 (P3)**: fully independent of US1–US3.

### Key intra-story ordering

- Schema (T007/T019/T032) → `db:generate` (T008/T020/T033) → service → routes → UI.
- Zod schema before the service that imports it.
- Service before its API route and before layout/UI wiring.
- Tests authored before implementation within each story (write → fail → implement).
- Migrations are sequential: T008 (0017) → T020 (0018) → T033 (0019).

---

## Parallel Opportunities

- **Setup**: T001, T002 in parallel (T003 edits globals.css/tailwind separately).
- **Per story**: the `[P]` test tasks, the Zod-schema task, the i18n task, and
  the admin-UI task touch different files and can run in parallel with the
  schema task; the service/route/layout tasks are sequential within the story.
- **Across stories**: once Foundational is done, US1/US2/US3/US4 can be staffed
  in parallel — but coordinate the three `pnpm db:generate` runs (T008→T020→T033)
  to keep migration numbering linear, and serialize edits to `app/layout.tsx`
  (T012 → T025 → T039) and to the i18n locale files.

### Parallel Example: User Story 1

```bash
# After T004, launch in parallel:
Task: "T005 Unit test appearance service (appearance-settings.test.ts)"
Task: "T006 E2E test appearance change (appearance-settings.spec.ts)"
Task: "T007 Add appearance_settings table to schema/index.ts"
Task: "T009 Zod schemas in packages/shared/src/appearance.ts"
# Then T008 (migration) → T010 (service) → T011 (route) → T012 (layout) → UI.
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 (US1).
2. **STOP & VALIDATE**: appearance configurable across all surfaces, no
   hardcoded literals. Deploy/demo.

### Incremental Delivery

US1 (MVP) → US2 (site identity, unblocks China-compliant deploy) → US3 (reading
themes) → US4 (pagination). Each story tested independently before the next.

### Notes

- `[P]` = different files, no incomplete-task dependency.
- Serialize: `app/layout.tsx` edits (T012, T025, T039) and i18n locale edits
  (T015, T028, T042, T049) — same files.
- Commit after each task or logical group; keep refactor (T003, T016, T048)
  commits separate from feature commits per project rules.
- Verify tests fail before implementing.
