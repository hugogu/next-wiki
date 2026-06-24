# Swap User Reading Theme & Admin System Theme — Design

**Status:** Approved
**Date:** 2026-06-24
**Scope:** Invert which role owns which theme model in
`specs/006-appearance-and-site-config/`. After the swap, the **per-user reading
theme** is a structured token bag (colors, fonts, sizes) and the **admin system
theme** is a single site-wide free-form CSS sheet that the admin authors and
controls.

## Motivation

The current implementation puts the right tool in the wrong hands:

- **Users** edit raw CSS in a textarea to customize reading. CSS is a poor fit
  for the decision a reader actually makes: pick the colors and font that feel
  comfortable.
- **Admins** fill in 13 color pickers, 3 font slots, and 4 size inputs to set
  app-wide tokens. Pickers are a poor fit for the one-off branding decision an
  admin makes; CSS is — that is exactly what CSS is for.

The sanitizer already encodes the intuition: user CSS is **typography only**
(strips color/background), which is a strong tell that those belong to the
system, and the system has no business being a 4-input picker UI.

The swap puts the structured tool in the user's hands and the free-form tool
in the admin's hands, while keeping the color-inheritance invariant intact
(user colors always win inside content; admin CSS styles the shell).

## Data model

### DB changes (single Drizzle migration, next sequence `0020`)

**Dropped:**

- `appearance_settings` table (admin tokens)
- `markdown_themes` table (user CSS list)
- `users.active_markdown_theme_id` column

**Added:**

```sql
-- Admin-authored site CSS, single-row pattern (id = 'default')
CREATE TABLE system_theme_settings (
  id          text PRIMARY KEY,
  css         text NOT NULL,
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 1 row per user; absent row means "use defaults"
CREATE TABLE user_appearance (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  light_colors jsonb NOT NULL,
  dark_colors  jsonb NOT NULL,
  fonts        jsonb NOT NULL,
  font_sizes   jsonb NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
```

The 13 color tokens, the 3 font slots, and the 4 size slots are unchanged —
they move from "admin-edit" to "user-default".

### Clean break

No data backfill. The single-row `appearance_settings` and any user-authored
`markdown_themes` rows are dropped with their tables. New users land on the
baked-in defaults. (Approved decision: clean break.)

## Token defaults

Move `apps/web/src/server/appearance/tokens.ts` → `user-tokens.ts`. Same
exports, same defaults, same `validateAppearanceInput()` semantics — they now
describe **the user's** defaults and the **per-user** validation. The admin
no longer validates structured input; they validate raw CSS.

- `COLOR_TOKEN_KEYS` (13) — unchanged
- `DEFAULT_LIGHT_COLORS` / `DEFAULT_DARK_COLORS` — unchanged
- `FONT_CATALOG` (5 entries) — unchanged
- `DEFAULT_FONTS` / `DEFAULT_FONT_SIZES` — unchanged

## Sanitizer

Replace `sanitizeThemeCss()` (user CSS sanitizer) with
`sanitizeSystemThemeCss()` (admin CSS sanitizer). The allowlist flips:

| | User CSS (old) | Admin CSS (new) |
|---|---|---|
| `color`, `background*`, `border-color` | strip | **strip** (admin also) |
| `font-*`, `text-*`, `line-height` | keep | keep |
| `margin`, `padding`, `display`, `position` | keep | keep |
| `flex-*`, `grid-*`, `width`, `height`, `max-*`, `min-*`, `gap` | keep | keep |
| `top/right/bottom/left`, `z-index` | strip | keep |
| `transform*`, `transition*`, `animation*`, `box-shadow`, `border-radius` | keep | keep |
| `border-{top,right,bottom,left}-{width,style}` | keep | keep |
| `url(...)`, `@import`, `expression(...)`, `image-set`, `javascript:` | reject | reject |
| `@keyframes` | reject | allow, but strip color/background inside |
| Max size | 20 000 chars | 50 000 chars |

The size bump reflects that admin CSS includes the whole shell layout, which
is typically 1–5 KB but can grow with utility classes and responsive rules.
`builtin-themes.ts` is dropped — there are no built-in themes in token form
anymore, and the two built-in CSS themes (`Default`, `Wiki.js-inspired`) are
replaced by the system-default token fallback.

## Injection pipeline

`apps/web/app/layout.tsx` (lines 26–77) swaps two `<style>` tags:

- **Drop** `<style id="app-appearance">` (system tokens)
- **Drop** `<style id="app-md-theme">` (user CSS, scoped)
- **Add** `<style id="app-system-theme">` — admin CSS, unscoped, raw
  `dangerouslySetInnerHTML`
- **Add** `<style id="app-reading-theme">` — built by
  `buildUserAppearanceCss(values)`:

  ```css
  .prose.prose {
    --color-primary: <user-light.primary>;
    /* …all 13 tokens… */
    --font-body: <user.fonts.body>;
    /* …3 fonts… */
    --font-size-base: <user.fontSizes.base>;
    /* …4 sizes… */
  }
  html.dark .prose.prose {
    --color-primary: <user-dark.primary>;
    /* …all 13 tokens… */
  }
  ```

  The `.prose.prose` selector (specificity 0,2,0) wins over `:root` (0,0,1)
  for any variable it touches, and over the admin CSS for those variables.
  No explicit scoping of admin CSS is required; the cascade does the work.

When a user has no `user_appearance` row, the layout does **not** inject
`app-reading-theme`; the cascade falls back to the static `:root` defaults
already in `apps/web/app/globals.css` (kept for backward compatibility and
marked as the system fallback).

## Services

| Replaced by | New | Dropped |
|---|---|---|
| `appearance-settings.ts` | `system-theme.ts`: `getSystemThemeCss()`, `updateSystemThemeCss(ctx, { css })` | `markdown-themes.ts` |
| `appearance-settings.ts` (per-user role) | `user-appearance.ts`: `getUserAppearance(ctx)`, `updateUserAppearance(ctx, input)`, `resetUserAppearance(ctx)`. Returns `{ …, isCustomized }` (true ⇔ row exists). | `appearance-settings.ts` |

The `manage_appearance` capability remains the gate for the admin route.
Authenticated users can read/write their own `user_appearance` row; no new
permission is needed.

## API surface

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/api/settings/appearance` | public | — | `SystemThemeView { css, updatedAt }` |
| PUT | `/api/settings/appearance` | `manage_appearance` | `{ css: string }` | `SystemThemeView` |
| GET | `/api/user/appearance` | authenticated | — | `UserAppearanceView { lightColors, darkColors, fonts, fontSizes, isCustomized }` |
| PUT | `/api/user/appearance` | authenticated | `UpdateUserAppearanceInput` | `UserAppearanceView` |
| DELETE | `/api/user/appearance` | authenticated | — | `UserAppearanceView` (defaults) |

**Dropped:** `/api/markdown-themes`, `/api/markdown-themes/[id]`,
`/api/markdown-themes/active`. Path `/api/settings/appearance` is **kept** (only
its body shape and response change) so any client that called the URL still
works.

## Shared schemas (`packages/shared/src/`)

- **New** `system-theme.ts`: `systemThemeViewSchema`, `updateSystemThemeInputSchema`
- **Renamed** `appearance.ts` → `user-appearance.ts` (no schema changes)
- **Deleted** `markdown-theme.ts`
- `packages/shared/src/index.ts` re-exports updated accordingly

## UI

### Admin (`apps/web/src/components/admin/appearance/`)

- **New** `SystemThemeForm.tsx` — CSS `<textarea>`, save / saving / saved
  states, "Reset" → PUTs empty `css`. Mirrors the existing form's
  feedback-state pattern.
- **New** `SystemThemePreview.tsx` — sandboxed wrapper that injects the
  candidate CSS and renders a chrome mock (header, sidebar, button, card)
  plus a `ProsePreviewSample` section so the admin sees both shells. Uses
  the existing `ProsePreviewSample.tsx` for the prose half.
- **Keep** `AppearanceNav.tsx` — same tab labels, same paths.
- **Drop** `AppearanceForm.tsx`, `AppearancePreview.tsx`

### User (`apps/web/src/components/user-center/`)

- **New** `ReadingThemeForm.tsx` — light/dark color sections, font section,
  size section, "Reset to default" button.
- **Extracted** shared `apps/web/src/components/appearance/TokenEditors.tsx`
  — `ColorTokenGrid`, `FontSlotSelect`, `FontSizeInput` (reused by both the
  user form and the preview).
- **New** `ReadingThemePreview.tsx` (replaces `MarkdownThemePreview.tsx`) —
  renders `ProsePreviewSample` with the candidate tokens applied via inline
  `--color-*` / `--font-*` / `--font-size-*` overrides.
- **Drop** `MarkdownThemesManager.tsx`, `MarkdownThemePreview.tsx`

### Routes (unchanged paths)

- `/admin/appearance` → `SystemThemeForm`
- `/user-center/reading-theme` → `ReadingThemeForm`

## i18n

`apps/web/src/i18n/locales/{en,zh}.ts`:

- `admin.appearance.{colors,fonts,sizes,preview}.*` → `admin.appearance.css.*`
  (label, placeholder, hint, save, saving, saved, error messages)
- `userCenter.readingTheme.*` → keep key path, repurpose content for the
  new form (sections: light, dark, fonts, sizes, reset, save, error)
- `admin.appearance.tabs.system` label stays "System theme" / "系统主题"
- `userCenter.nav.readingTheme` label stays "Reading theme" / "阅读主题"

## Tests

| Test file | Change |
|---|---|
| `appearance-settings.test.ts` | **Delete** |
| `markdown-themes.test.ts` | **Delete** |
| `user-appearance.test.ts` | **New** — `getUserAppearance` returns defaults when no row; upsert creates/updates; `isCustomized` flips; validation rejects bad colors / fonts / sizes |
| `system-theme.test.ts` | **New** — get returns `''` when no row; update sanitizes; rejects oversized / invalid CSS; records `updated_by` |
| `css-sanitize.test.ts` | **Replace** markdown-theme cases with `sanitizeSystemThemeCss` cases (allows layout, strips color, strips url/@import, strips keyframes with colors) |
| `user-tokens.test.ts` (or co-located) | **New** — `buildUserAppearanceCss` produces expected CSS, includes both light + dark selectors |
| `appearance-settings.spec.ts` (E2E) | **Rename** to `system-theme.spec.ts`; admin writes CSS, sees it in DOM |
| `markdown-themes.spec.ts` (E2E) | **Rename** to `reading-theme.spec.ts`; user toggles colors, sees them in `.prose` |
| `site-settings.spec.ts` (E2E) | Unchanged |

## Files touched (summary)

| Layer | Count | Notes |
|---|---|---|
| DB migration | 1 | `0020_swap_themes.sql` |
| Drizzle schema | 1 file | `apps/web/src/server/db/schema/index.ts` |
| Shared Zod | 2 new, 1 deleted, 1 renamed | `packages/shared/src/{system-theme,user-appearance}.ts`; delete `markdown-theme.ts`; rename `appearance.ts` |
| Server services | 2 new, 2 deleted | `system-theme.ts`, `user-appearance.ts`; delete `markdown-themes.ts`, `appearance-settings.ts` |
| Server appearance | 1 file renamed, 1 file replaced | `tokens.ts` → `user-tokens.ts`; `css-sanitize.ts` swaps sanitizer function; `builtin-themes.ts` deleted |
| API routes | 1 added, 3 removed, 1 changed | `/api/user/appearance`; delete `/api/markdown-themes*`; `/api/settings/appearance` body shape changes |
| Layout | 1 file | `apps/web/app/layout.tsx` injection pipeline |
| Admin UI | 2 new, 2 deleted | `SystemThemeForm`, `SystemThemePreview`; delete `AppearanceForm`, `AppearancePreview` |
| User UI | 2 new, 2 deleted, 1 extracted | `ReadingThemeForm`, `ReadingThemePreview`; delete `MarkdownThemesManager`, `MarkdownThemePreview`; extract `TokenEditors` |
| i18n | 2 files | `en.ts`, `zh.ts` |
| Tests | 4 new, 3 deleted, 1 replaced | per the table above |
| Specs | 3 files | `data-model.md`, `research.md`, `contracts/{appearance-settings,markdown-themes}.md`; update to reflect the swap |
| Docs | 1 design doc | this file |

## Commits (proposed, in order)

1. `feat(theme): drop old appearance_settings and markdown_themes tables`
2. `feat(theme): add system_theme_settings and user_appearance tables`
3. `refactor(theme): move token constants and validation to user-appearance context`
4. `feat(theme): add sanitizeSystemThemeCss and buildUserAppearanceCss`
5. `feat(api): add /api/user/appearance endpoints`
6. `feat(api): switch /api/settings/appearance to free-form CSS`
7. `feat(web): inject system CSS and per-user token styles in root layout`
8. `feat(admin): replace AppearanceForm with SystemThemeForm (CSS editor)`
9. `feat(user): replace MarkdownThemesManager with ReadingThemeForm (token picker)`
10. `chore(i18n): update en/zh strings for swapped theme panels`
11. `test(theme): add user-appearance and system-theme coverage`
12. `docs(spec): update data-model, research, and contracts for the swap`
13. `docs(api): regenerate openapi`

## Out of scope

- Re-introducing built-in reading themes (the new defaults live in code, not in
  the database).
- Migrating existing user CSS themes into tokens (clean break by user decision).
- Per-page reading theme overrides (single per-user set covers all `.prose`).
- A/B testing or staged rollout (the swap is atomic per deploy).

## Open follow-ups (not blocking)

- Rename `/api/settings/appearance` to `/api/settings/system-theme` once all
  internal callers are migrated. Skipped this round to keep the path stable.
- Consider exposing `user_appearance` as a public profile export field
  (deferred to user-profile US).
