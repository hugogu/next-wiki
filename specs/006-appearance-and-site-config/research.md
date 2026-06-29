# Phase 0 Research: Appearance & Site Configuration

> **Amended 2026-06-24 — theme ownership inverted.** See
> [swap-amendment.md](./swap-amendment.md). R3/R4/R5 below record the original
> decisions; the **as-built** design swapped ownership: per-user reading theme →
> structured tokens (`user_appearance`), admin system theme → free-form
> sanitized CSS (`system_theme_settings`). The injection mechanism (R1), token
> set (R2), fonts (R6), site icon (R7), footer (R8), and pagination (R9) are
> unchanged. Inline **Amended** notes flag the differences.

The technology stack is fixed by the constitution (Next.js 16, Drizzle,
PostgreSQL, Tailwind + CSS custom properties, unified/remark/rehype). There are
no open `NEEDS CLARIFICATION` items in Technical Context. This document records
the design decisions for the non-obvious mechanisms.

## R1. Runtime injection of admin-configured appearance tokens

**Decision**: Keep `globals.css` `:root` / `html.dark` blocks as the *fallback
defaults*. In the root layout (RSC), read the single `appearance_settings` row
and emit a `<style id="app-appearance">` in `<head>` that redefines the same CSS
custom properties for `:root` (light values) and `html.dark` (dark values).
Configured values override the static defaults via cascade; if no row exists,
the static defaults apply.

**Rationale**: The token layer already exists and is consumed everywhere via
`var(--color-*)` / `var(--font-*)`. Overriding the variables at the root is the
minimal, framework-native change — no component touches required, works for SSR
(no flash), and respects the existing `html.dark` toggle mechanism. Light/dark
are configured as two complete value sets (clarification Q1), mapping cleanly to
`:root` and `html.dark`.

**Alternatives considered**:
- *Rewrite globals.css from DB at build time* — rejected: requires redeploy,
  violates SC-002 ("no code change or redeploy").
- *Client-side injection after hydration* — rejected: causes a flash of default
  theme (FOUC) and breaks SSR consistency.

## R2. Removing remaining hardcoded style literals + font-size tokens

**Decision**: Audit feature components for raw color/font/size literals. The
sanctioned token layer is `globals.css` + `tailwind.config.ts`; feature
components must reference tokens. Introduce explicit **font-size tokens** with
the canonical shape `{ base, h1, h2, h3 }` → CSS custom properties
`--font-size-base`, `--font-size-h1`, `--font-size-h2`, `--font-size-h3` (set
via the appearance settings) so base font size is configurable (FR-001) and
Markdown themes can override typography (R4). Add the size tokens to
`tailwind.config.ts`. This `{ base, h1, h2, h3 }` shape is the single canonical
form used across the contract, data model, and Zod schema.

**Rationale**: `globals.css` `.prose` currently hardcodes heading sizes
(`2.25rem`, etc.). Promoting them to tokens is required for FR-001 ("base font
sizes") and FR-011a (themes override typography). The `.prose`/`ui/` layer is
the design-system surface, which P5 permits; the prohibition targets *feature*
components.

**Alternatives**: Leaving sizes hardcoded — rejected, blocks FR-001 & FR-011a.

## R3. Settings storage shape

> **Amended:** as-built, the structured-token table is per-user
> (`user_appearance`, PK `user_id`), not a single admin row; the admin single
> row holds free-form CSS (`system_theme_settings`). Site settings store the
> icon inline as `icon_data`/`icon_mime`, not an asset FK.

**Decision**: Two single-row tables mirroring the existing `ai_settings`
pattern (`id text primary key default 'default'`):
- `appearance_settings`: JSONB `light_colors`, JSONB `dark_colors`, JSONB
  `fonts` (body/display/mono = bundled font keys), JSONB `font_sizes`, plus
  `updated_by` / `updated_at`.
- `site_settings`: `site_name`, `icon_asset_id` (nullable → default icon),
  `footer_copyright`, `icp_number`, `icp_url`, `public_security_number`,
  `public_security_url`, `updated_by` / `updated_at`.

**Rationale**: Matches the established single-row settings convention
(`ai_settings` id `'default'`), keeps the global config trivially fetchable, and
JSONB keeps the token bag flexible without schema churn while values are still
validated by Zod at the service boundary.

**Alternatives**:
- *One combined table* — rejected: spec models them as two entities with
  distinct admin surfaces; separation keeps each concern cohesive.
- *Key/value EAV table* — rejected: over-engineered for a fixed, validated set.

## R4. Markdown theme model, scoping, and color inheritance

> **Amended:** there is no `markdown_themes` table and no per-user CSS list in
> the as-built design. The per-user surface is structured tokens
> (`user_appearance`); the admin surface is free-form CSS
> (`system_theme_settings`). The color-inheritance invariant still holds: user
> reading-theme tokens win inside `.prose.prose`; the system CSS may not set
> colors. Starting token defaults live in code under
> `apps/web/src/server/appearance/`, not as seeded DB rows.

**Decision**: `markdown_themes` table: `id`, `owner_user_id` (NULL = built-in),
`name`, `css` (text), `is_builtin` (bool), timestamps; unique `(owner_user_id,
name)`. Built-ins ("Default", "Wiki.js-inspired") are seeded as `is_builtin =
true, owner_user_id = NULL` and are read-only. A user's active theme is a
nullable `users.active_markdown_theme_id` FK (`on delete set null`), extending
the existing per-user preference pattern (`theme_preference`/`locale_preference`
already live on `users`).

Application: the active theme's CSS is injected as a `<style>` scoped under the
content container (e.g. `.prose[data-md-theme] { … }` / wrapper class). The CSS
may set **only typography/layout properties**; colors are never declared by the
theme and continue to resolve from the system `--color-*` tokens (clarification
Q3). Both the reader (`ContentRenderer`) and the editor preview render inside
this scoped container, so both pick up the active theme (clarification Q4); any
HTML-based export reuses the same render path and inherits it automatically.

**Rationale**: Built-ins as a seeded, bounded registry satisfy P9 (explicit,
testable loading, no filesystem scanning). Reusing `users` for the active-theme
pointer matches the existing preferences mechanism and avoids a new join table.
Scoping under the content container guarantees themes cannot affect global
chrome (FR-017). Forcing colors through system tokens guarantees light/dark
consistency (FR-011a).

**Alternatives**:
- *Store active theme in a separate `user_preferences` table* — rejected: theme
  prefs already live on `users`; consistency over a new table.
- *Allow themes to set colors* — rejected by clarification Q3 (consistency).

## R5. Confining/sanitizing authored CSS (FR-017)

> **Amended:** the sanitized free-form CSS is now the **admin system theme**
> (`sanitizeSystemThemeCss` in `css-sanitize.ts`), not per-user Markdown CSS.
> The allowlist additionally permits layout properties, `@keyframes`, `content`,
> and flex/grid alignment; it still strips remote `url()` / `@import`, and allows
> color-bearing properties only with design-token values (`var(--…)`) or safe
> keywords — hardcoded colors are stripped so themes stay light/dark-consistent.

**Decision**: Sanitize on save in `css-sanitize.ts`:
1. Parse the CSS with **`postcss`** (already transitively present in the
   workspace via the Tailwind toolchain — no new top-level dependency). This is
   the committed parser choice; `css-tree` was considered but rejected to avoid
   adding a dependency.
2. **Reject/strip** `@import`, `url(...)` referencing non-data/remote
   resources, `position: fixed`, and any selector escaping the scoped content
   root; re-scope every rule under the content container selector at injection
   time.
3. **Allowlist** typography/layout property families (font-*, line-height,
   letter-spacing, text-*, margin, padding, border*, list-style, max-width,
   etc.); drop `color`/`background-color` declarations (colors come from tokens
   — R4) and anything not on the allowlist.
4. Enforce a max size on the CSS string.

Injection re-prefixes all selectors with the content-root scope so a malformed
selector cannot leak. No JS, no `<style>` from untrusted source rendered
un-scoped.

**Rationale**: CSS injection is lower-risk than JS but can still exfiltrate via
remote `url()` and disrupt layout; allowlisting + scoping + remote-resource
blocking confines effects to the content area and satisfies the no-remote-
resource constraint. Re-scoping at injection is defense-in-depth over save-time
validation.

**Alternatives**:
- *Trust raw CSS, only wrap in a scoped `<style>`* — rejected: scoping alone
  doesn't stop remote `url()` exfiltration or `@import`.
- *Constrained variable-only editor (no raw CSS)* — rejected: the user
  explicitly requires viewing/editing full CSS file content.

## R6. Fonts: bundled set only

**Decision**: Ship a fixed catalog of font choices: the current Google fonts
already loaded via `next/font` (Crimson Pro, Source Sans 3) self-hosted by
Next.js at build, plus system font stacks (sans/serif/mono). The appearance
settings store a font *key* from this catalog, not an arbitrary string. Validate
the key server-side; reject unknown keys (FR-005).

**Rationale**: `next/font` already self-hosts Google fonts at build time (no
runtime CDN), satisfying the self-hosted / no-remote-resource constraint
(clarification Q2, FR-001b). A keyed catalog makes "unavailable font" rejection
well-defined and keeps the bundle bounded.

**Alternatives**: Arbitrary font-family string (rejected: uncontrollable/unsafe)
or admin-supplied web-font URL (rejected: remote resource dependency).

## R7. Default site icon / favicon

**Decision**: Generate and commit a simple default SVG favicon (a minimal "wiki"
glyph in the brand accent) under `apps/web/public/`. `site_settings.icon_asset_id`
NULL → serve the default; non-NULL → serve the uploaded icon bytes from the
existing content/blob store via an asset route. Wire the icon and site name into
Next.js `generateMetadata` (`title`, `icons`).

**Rationale**: Next.js metadata is the framework-native way to set favicon/title
across all routes from one place; reusing the existing blob store avoids a new
storage mechanism. A shipped default guarantees no page is icon-less (FR-007).

**Alternatives**: PNG default (rejected: SVG scales, tiny, themeable); storing
icon on disk (rejected: breaks multi-replica/stateless container model — DB/blob
store is the source of truth).

## R8. China regulatory footer (ICP / 公安备案)

**Decision**: `site_settings` holds optional `icp_number` and
`public_security_number` (+ optional display URLs). `Footer.tsx` renders the
copyright line always (if set) and the filing lines only when present, linking
ICP to `https://beian.miit.gov.cn/` and public-security filings to
`https://beian.mps.gov.cn/` by default (overridable). Empty fields render
nothing (edge case).

**Rationale**: Chinese hosting law requires the ICP filing number be visible and
linked to the MIIT registry in the site footer; public-security filing is
additionally required in some regions. Optional fields keep non-China
deployments clean.

**Alternatives**: Free-text-only footer (rejected: misses the structured,
linked-registry requirement that operators rely on for compliance).

## R9. Unified pagination via URL search params

**Decision**: A `src/components/ui/Pagination.tsx` primitive that is **stateless
over the URL**: it reads the current page from a `page` search param and renders
links (`<Link>` / anchors) to `?page=N` for first / prev / next / last / nearby
pages, preserving other existing query params. Server components read
`searchParams.page`, clamp to `[1, lastPage]` (FR-023), and compute
offset = `(page-1) * pageSize`. The component is hidden/disabled for
single-page/empty lists (FR-024). Disabled boundaries are non-link, `aria-disabled`.

**Rationale**: Search-param state is mandated by Frontend Data Flow and P10
(shareable, bookmarkable, back/forward-safe). Link-based navigation keeps it
RSC-friendly and SSR-correct. One primitive used everywhere satisfies "unified
component" (FR-019) and the duplicate-entry-point anti-pattern.

**Alternatives**:
- *Client component holding page in `useState`* — rejected: state without a URL
  (anti-pattern), breaks deep-link/share/refresh.
- *Path-segment pagination `/list/page/2`* — rejected: query param is the
  conventional, less intrusive form and composes with existing filters.

## Summary of resolved decisions

| # | Topic | Decision |
|---|-------|----------|
| R1 | Token injection | Root-layout `<style>` overriding `:root`/`html.dark` from DB |
| R2 | Hardcoded literals | Audit + promote font sizes to tokens; design-system layer exempt |
| R3 | Settings storage | *(amended)* `system_theme_settings` (1 admin row, CSS) + `user_appearance` (per-user tokens) + `site_settings` |
| R4 | Theme model | *(amended)* per-user structured tokens (`user_appearance`); no `markdown_themes` table; colors from tokens, win inside `.prose.prose` |
| R5 | CSS safety | *(amended)* `sanitizeSystemThemeCss` (allowlist props/layout/keyframes, strip remote url/@import + colors) on the admin system CSS |
| R6 | Fonts | Keyed bundled catalog (`next/font` self-hosted + system stacks) |
| R7 | Default icon | Shipped SVG default; `generateMetadata`; uploaded icon via blob store |
| R8 | China footer | Optional ICP/公安备案 fields linked to official registries |
| R9 | Pagination | Search-param (`page`) driven shared `ui/Pagination`, clamped, link-based |
