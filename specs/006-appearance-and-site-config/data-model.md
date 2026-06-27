# Phase 1 Data Model: Appearance & Site Configuration

> **Amended 2026-06-24 — theme ownership inverted.** See
> [swap-amendment.md](./swap-amendment.md) for the full change log. This
> document reflects the **as-built** schema. The original US1/US3 design placed
> structured tokens on an admin `appearance_settings` table and free-form CSS on
> a per-user `markdown_themes` list; the swap (migration `0020_swap_themes.sql`)
> replaced both with `system_theme_settings` (admin free-form CSS, 1 row) and
> `user_appearance` (per-user structured tokens, 1 row per user). US2
> (`site_settings`) and US4 (pagination, no table) are unaffected.

All tables use Drizzle ORM (`apps/web/src/server/db/schema/index.ts`). Naming is
`snake_case` per project rules. Migration order: `0017_*`/`0019_*` introduced the
original appearance + markdown-theme tables, `0018_*` added `site_settings`
(US2), and `0020_swap_themes.sql` performed the inversion to the as-built tables
below.

## Entity: `system_theme_settings` (single row)

Site-wide system theme **CSS** authored by an admin. Single row keyed
`id = 'default'` (mirrors `ai_settings`). The CSS is sanitized on save and
applied to the app shell (outside `.prose`).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` PK, default `'default'` | Always one row |
| `css` | `text` not null default `''` | Sanitized free-form CSS (R5) |
| `updated_by` | `uuid` → `users.id` `on delete set null` | Auditing |
| `updated_at` | `timestamptz` not null default now | |

**Validation** (Zod `@next-wiki/shared/system-theme.ts`): `css` passes
`sanitizeSystemThemeCss` (allowlisted properties incl. layout/keyframes; no
remote `url()` / `@import`; no color declarations — colors stay token-driven so
light/dark stays consistent, R5 / FR-017); enforce a max size.

## Entity: `user_appearance` (one row per user)

Per-user reading-theme **structured tokens**. Absent row ⇒ the user has not
customized and the root layout falls back to the static defaults. The user's
light/dark mode preference (`users.theme_preference`) selects which color set
applies.

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | `uuid` PK → `users.id` `on delete cascade` | One row per user |
| `light_colors` | `jsonb` not null | Map of token name → color value for light mode |
| `dark_colors` | `jsonb` not null | Map of token name → color value for dark mode |
| `fonts` | `jsonb` not null | `{ body, display, mono }` = font catalog keys (R6) |
| `font_sizes` | `jsonb` not null | `{ base, h1, h2, h3 }` size tokens (R2) |
| `updated_at` | `timestamptz` not null default now | |

**Validation** (Zod `@next-wiki/shared/user-appearance.ts`):
- Color values: valid CSS color (hex / rgb(a) / hsl(a)); reject malformed
  (FR-005). Token-name keys must belong to the canonical 13-token set.
- `fonts.*`: must be a key in the bundled 5-entry font catalog (FR-001b / R6).
- `font_sizes.*`: positive length values (`rem`/`px`/`em`); reject non-positive.
- `light_colors` and `dark_colors` MUST each cover the full required token set
  (clarification Q1).

## Entity: `site_settings` (single row)

Site identity + footer. Single row keyed `id = 'default'`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` PK, default `'default'` | Always one row |
| `site_name` | `text` not null default `'next-wiki'` | Header + `<title>` |
| `icon_data` | `bytea` nullable | Custom icon bytes; NULL ⇒ shipped default icon (FR-007). Stored inline (single small favicon — simpler than coupling to the page-asset store) |
| `icon_mime` | `text` nullable | MIME type of `icon_data` |
| `footer_copyright` | `text` nullable | Free-form copyright line |
| `icp_number` | `text` nullable | China ICP 备案号 |
| `icp_url` | `text` nullable | Default `https://beian.miit.gov.cn/` |
| `public_security_number` | `text` nullable | 公安备案号 (optional) |
| `public_security_url` | `text` nullable | Default `https://beian.mps.gov.cn/` |
| `updated_by` | `uuid` → `users.id` `on delete set null` | Auditing |
| `updated_at` | `timestamptz` not null default now | |

**Validation**: `site_name` non-empty, length-bounded; URLs (if present) valid
http(s); filing numbers length-bounded. Empty filing fields render no footer
compliance text (edge case).

## Built-in token defaults (code, not a table)

The post-swap design has **no `markdown_themes` table** and no per-user theme
list. The starting token values (the canonical 13-color set for light/dark, the
3 font slots, the 4 size slots) live in code at
`apps/web/src/server/appearance/` (`builtin-themes.ts` / token defaults), which
also seeds the static fallback used when a user has no `user_appearance` row
(P9 bounded registry — explicit, no filesystem scanning).

## Relationships

```text
users 1───0..1 user_appearance      (user_id PK/FK, cascade delete)
system_theme_settings (1 row)        updated_by → users
site_settings (1 row)                updated_by → users; icon stored inline (icon_data/icon_mime)
```

## Derived / non-persistent

- **Resolved reading-theme CSS**: built in the root layout from the caller's
  `user_appearance` tokens (or static defaults) via `buildUserAppearanceCss`
  and injected as `<style id="app-reading-theme">` scoped to `.prose.prose`
  (R1 / R4).
- **System theme CSS**: read from `system_theme_settings` (or empty) and
  injected unscoped as `<style id="app-system-theme">` for the app shell.
- **Pagination state**: the `page` URL search param — not persisted (R9).

## Permissions

- `manage_appearance` capability gates writes to `system_theme_settings` and
  `site_settings` — evaluated through the existing `can()` chokepoint; no
  hardcoded admin bypass (Permission mandate).
- `user_appearance` read/write is scoped to the **owning user** (the caller);
  no admin capability required.
