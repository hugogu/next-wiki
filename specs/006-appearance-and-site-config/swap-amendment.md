# Appearance & Site Config — Design Amendment

> Status: Active
> Date: 2026-06-24
> Affects: All US1 (system appearance) and US3 (reading theme) artifacts in
> `specs/006-appearance-and-site-config/`.

## Summary

The original design for 006 placed structured color/font/size pickers in the
admin's System theme panel and free-form CSS in the user's Reading theme
panel. The original implementation followed that design. After a 2026-06-24
review we inverted ownership:

- **Per-user Reading theme** → structured tokens (light + dark colors, fonts,
  sizes) picked from a 13-token color set and a 5-entry font catalog.
- **Admin System theme** → free-form CSS, sanitized on save, applied to the
  app shell (outside `.prose`).

The rationale: the colors/fonts a reader actually picks are best surfaced as
structured pickers, while a one-time app-shell styling decision is best
expressed as raw CSS.

## What changed

| Layer | Before | After |
|---|---|---|
| DB | `appearance_settings` (admin tokens), `markdown_themes` (user CSS list), `users.active_markdown_theme_id` | `system_theme_settings` (admin CSS, 1 row), `user_appearance` (user tokens, 1 row per user) |
| Shared Zod | `appearance.ts`, `markdown-theme.ts` | `user-appearance.ts`, `system-theme.ts` |
| Server | `appearance-settings.ts` (structured tokens), `markdown-themes.ts` (CSS list) | `system-theme.ts` (free-form CSS), `user-appearance.ts` (structured tokens) |
| Sanitizer | `sanitizeThemeCss` (no colors) | `sanitizeSystemThemeCss` (no colors; now permits layout, keyframes) |
| Style builder | `buildAppearanceStyleCss` (`:root` + `html.dark`) | `buildUserAppearanceCss` (`.prose.prose` + `html.dark .prose.prose`) |
| Built-in themes | `builtin-themes.ts` (Default, Wiki.js-inspired) | dropped — defaults live in code |
| API | `/api/settings/appearance` (tokens), `/api/markdown-themes*` (list) | `/api/settings/appearance` (CSS), `/api/user/appearance` (tokens) |
| Layout injection | `<style id="app-appearance">` + `<style id="app-md-theme">` | `<style id="app-system-theme">` + `<style id="app-reading-theme">` |
| Admin UI | `AppearanceForm` (pickers) | `SystemThemeForm` (CSS textarea) |
| User UI | `MarkdownThemesManager` (CSS list) | `ReadingThemeForm` (token pickers) |
| i18n keys | `admin.appearance.{colors,fonts,sizes}`, `userCenter.readingTheme.{css,name,builtin,…}` | `admin.appearance.css.*`, `userCenter.readingTheme.{light,dark,fonts,sizes,…}` |

## What stayed the same

- 13 color tokens (`primary`, `primary-text`, `primary-hover`, `background`,
  `surface`, `surface-elevated`, `border`, `border-strong`, `muted`,
  `foreground`, `ring`, `danger`, `warning`).
- 3 font slots (`body`, `display`, `mono`).
- 4 font-size slots (`base`, `h1`, `h2`, `h3`).
- 5-entry bundled font catalog (Source Sans 3, Crimson Pro, System Sans,
  System Serif, System Mono).
- `manage_appearance` permission for admin writes.
- Light/dark mode preference (`users.themePreference` + `html.light` /
  `html.dark` class).
- `/admin/appearance` and `/user-center/reading-theme` paths (UI URLs stable).

## Color-inheritance invariant

User reading-theme tokens always win inside `.prose.prose` (specificity
0,2,0). The admin's CSS is emitted unscoped; inside `.prose` it can affect
layout, spacing, borders, and shadows but not color variables (the sanitizer
forbids color declarations).

## Source of truth for the new design

- Design: `docs/plans/2026-06-24-swap-themes-design.md`
- Implementation plan: `docs/plans/2026-06-24-swap-themes.md`
- Migration: `apps/web/src/server/db/migrations/0020_swap_themes.sql`

US2 (site info) and US4 (pagination) are unaffected by the swap and their
artifacts remain authoritative.
