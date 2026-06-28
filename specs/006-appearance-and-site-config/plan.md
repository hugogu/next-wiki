# Implementation Plan: Appearance & Site Configuration

**Branch**: `006-appearance-and-site-config` | **Date**: 2026-06-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-appearance-and-site-config/spec.md`

> **Amended 2026-06-24 — theme ownership inverted.** This plan records the
> original approach. The as-built design swapped Stories 1 and 3: tables are
> `system_themes` (named admin-CSS list) + `system_theme_settings.active_theme_id`
> + `user_appearance` (per-user tokens), shared Zod is `system-theme.ts` +
> `user-appearance.ts`, services are `system-theme.ts` + `user-appearance.ts`,
> and the new REST surfaces are `/api/system-themes` (list/`[id]`/active) +
> `/api/user/appearance` (tokens). The single `/api/settings/appearance` CSS
> endpoint was removed by `0021_system_themes_list.sql`. There is no
> `markdown_themes` table, no `markdown-themes` routes, and no
> `users.active_markdown_theme_id`. See [swap-amendment.md](./swap-amendment.md),
> [data-model.md](./data-model.md), and the
> [contracts](./contracts/). References below to `appearance_settings`,
> `markdown_themes`, `appearance.ts`, and `markdown-theme.ts` are superseded.

## Summary

Four related capabilities that finish the product's design-token story and its
site-identity surface:

1. **System appearance settings** — make the existing CSS-variable token layer
   (colors, fonts, sizes) administrator-configurable site-wide, with separate
   light/dark color sets, fonts limited to a bundled set, and a runtime
   injection of the active values; remove remaining hardcoded style literals.
2. **Per-user Markdown reading themes** — a small registry of Markdown themes
   (built-in read-only "Default" + "Wiki.js-inspired", plus user-owned editable
   copies) that override only typography/layout (never colors), viewable and
   editable as CSS in-app, activated per user, applied to the reader and the
   editor preview.
3. **Site information** — admin-configurable site name, icon/favicon (with a
   shipped default), footer copyright, and China regulatory filing numbers (ICP
   + optional 公安备案), rendered on every page.
4. **Unified pagination** — one shared `ui/Pagination` component driven by a
   URL search param (`page`), with first/prev/next/last, used by every list.

Technical approach: two single-row settings tables (`appearance_settings`,
`site_settings`) following the existing `ai_settings` pattern; a
`markdown_themes` table plus a per-user active-theme reference; runtime CSS
custom-property injection in the root layout (RSC) reading from the DB; a
sanitized, scoped `<style>` injection for the active Markdown theme; Next.js
`generateMetadata` for site name/favicon; and a search-param-driven shared
pagination primitive in `src/components/ui/`.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20.9+ (Next.js 16 runtime floor)
**Primary Dependencies**: Next.js 16 (App Router/RSC), React 19.2, Drizzle ORM,
PostgreSQL 16+, Tailwind CSS + CSS custom properties, unified/remark/rehype
(render pipeline), Zod (`@next-wiki/shared`), TanStack Query (existing
`ApiProvider`, used by the new admin forms), `postcss` (Markdown-theme CSS
sanitizer — already transitively present)
**Storage**: PostgreSQL via Drizzle — new tables `appearance_settings` (single
row), `site_settings` (single row), `markdown_themes`; new column on `users` for
active Markdown theme; site icon bytes stored via the existing content/blob
store (the same store used for content assets)
**Testing**: Vitest (unit/integration), Playwright (E2E)
**Target Platform**: Self-hosted Linux server via Docker Compose / Kubernetes
**Project Type**: Web application (pnpm + Turborepo monorepo, `apps/web`)
**Performance Goals**: Markdown theme switch re-renders the content without a
full page reload (SC-004); appearance/site changes reflected on next navigation
with no redeploy (SC-002/3)
**Constraints**: No remote/web font dependency (FR-001b); user Markdown CSS
confined to the content area, no remote resource loading (FR-017); native
browser navigation + URL-addressable page state preserved (constitution P10)
**Scale/Scope**: Single-tenant self-hosted wiki; settings are single-row global;
Markdown themes are per-user with a small per-user count; pagination applies to
all existing list surfaces (search, admin lists, history, transfers, etc.)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Mandate | Relevance | Compliance |
|---------------------|-----------|------------|
| **P5 Style System Independence & UI Consistency** | Core driver | ✅ Feature *implements* P5: tokens become configurable, no hardcoded literals in feature components, all surfaces flow through `src/components/ui/` + token layer. Markdown theme CSS is the one sanctioned per-user style surface, scoped to content. |
| **P9 Explicit Over Implicit** | Markdown theme registry; settings | ✅ Built-in themes are an explicit, bounded registry with a testable loading contract; no filesystem scanning. Settings read through explicit service functions. |
| **P10 Native Web Navigation & Unified Entry Points** | Pagination | ✅ Page number lives in URL search params; back/forward/refresh/deep-link/share preserved; single shared component = one canonical mechanism. |
| **Frontend Data Flow mandate** (URL state in search params) | Pagination | ✅ Page state in search params, not component state. |
| **Permission Model mandate** (`can()` chokepoint, no admin bypass) | Admin settings; theme ownership | ✅ Appearance/site writes gated by a settings admin capability via `can()`; Markdown theme ops gated to the owning user; built-ins read-only. |
| **API Architecture mandate** (REST + OpenAPI, shared service + Zod) | New endpoints | ✅ New REST route handlers under `app/api/`, Zod schemas in `@next-wiki/shared`, shared service layer in `src/server/services/`. |
| **P8 Open Standards** | Theme format | ✅ Themes are plain CSS (viewable/copyable); no proprietary format. |
| **Anti-pattern: per-page bespoke styling** | Whole feature | ✅ Directly eliminates this anti-pattern. |
| **Anti-pattern: state without a URL / broken navigation** | Pagination | ✅ Eliminated by URL-param pagination. |
| **P6 Async-First (>500ms)** | Settings are light, synchronous CRUD | ✅ N/A — no heavy operations introduced; favicon processing is small and bounded. |

**Result**: PASS — no violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/006-appearance-and-site-config/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (REST + UI/component contracts)
│   ├── appearance-settings.md
│   ├── site-settings.md
│   ├── markdown-themes.md
│   └── pagination.md
└── tasks.md             # Phase 2 (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
apps/web/
├── app/
│   ├── layout.tsx                      # inject appearance tokens + active MD theme; generateMetadata (name/favicon)
│   ├── (admin)/admin/
│   │   └── appearance/                 # NEW admin surface: System theme, Site info, Markdown themes (tabs)
│   │       ├── page.tsx                #   system appearance (colors/fonts/sizes, light+dark)
│   │       ├── site/page.tsx           #   site name/icon/footer/ICP
│   │       └── themes/                 #   markdown theme management (list/view/edit)
│   ├── api/
│   │   ├── settings/appearance/route.ts    # NEW GET/PUT appearance settings
│   │   ├── settings/site/route.ts          # NEW GET/PUT site settings (+ icon upload)
│   │   └── markdown-themes/                 # NEW CRUD + activate for MD themes
│   │       ├── route.ts
│   │       └── [id]/route.ts
│   └── (public)/...                    # consume shared Pagination on list routes
├── src/
│   ├── server/
│   │   ├── db/schema/index.ts          # + appearance_settings, site_settings, markdown_themes; users.activeMarkdownThemeId
│   │   ├── db/migrations/0017,0018,0019 # one per story, generated via pnpm db:generate
│   │   ├── services/
│   │   │   ├── appearance-settings.ts  # NEW service (read/write tokens, validation)
│   │   │   ├── site-settings.ts        # NEW service (name/icon/footer/ICP)
│   │   │   └── markdown-themes.ts       # NEW service (registry + per-user CRUD + activate + CSS sanitize)
│   │   ├── appearance/                  # NEW: built-in theme definitions + token defaults + css sanitizer
│   │   │   ├── builtin-themes.ts        #   Default + Wiki.js-inspired CSS (bounded registry)
│   │   │   ├── tokens.ts                #   canonical token names + default values (light/dark)
│   │   │   └── css-sanitize.ts          #   confine/allowlist user CSS (typography-only, no remote url())
│   │   └── permissions/index.ts        # + manage_appearance capability
│   ├── components/
│   │   ├── ui/Pagination.tsx           # NEW shared pagination primitive (search-param driven)
│   │   ├── ui/Footer.tsx               # NEW site footer (copyright + ICP/公安备案 links) — P5: primitives live in ui/
│   │   ├── admin/appearance/           # NEW admin UI (token editor, site form, theme editor/preview)
│   │   └── theme/                       # AppearanceStyle injector (renders <style> from settings) + MD theme injector
│   └── i18n/locales/{en,zh}.ts         # + appearance/site/theme/pagination strings
├── public/                             # default favicon/icon asset; bundled font files (if any beyond system stack)
└── tailwind.config.ts                  # ensure all tokens mapped (font-size tokens added)
packages/shared/src/
├── appearance.ts                       # NEW Zod: AppearanceSettings, color/font/size schemas
├── site.ts                             # NEW Zod: SiteSettings (name/icon/footer/ICP)
└── markdown-theme.ts                   # NEW Zod: MarkdownTheme, create/rename/activate inputs
```

**Structure Decision**: Web-application monorepo layout (existing). All server
logic stays under `apps/web/src/server/` (server-only per Project Structure
mandate); all UI primitives (`Pagination`) live in `src/components/ui/`; all
shared validation schemas in `packages/shared/` (zero-dep). New admin surfaces
mount under the existing `(admin)/admin` route group, exposed via the existing
`Navigator` admin nav as a single new "Appearance" entry with tabs (one
canonical entry point per resource — P10).

## Complexity Tracking

No constitution violations — section intentionally empty.
