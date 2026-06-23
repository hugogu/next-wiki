# Phase 1 Data Model: Appearance & Site Configuration

All tables use Drizzle ORM (`apps/web/src/server/db/schema/index.ts`). To keep
the four user stories independently deliverable, each story adds its own table(s)
and runs `pnpm db:generate`, producing **three sequential migrations**:
`0017_*` (appearance settings, US1), `0018_*` (site settings, US2), and
`0019_*` (markdown themes + `users.active_markdown_theme_id`, US3). Naming is
`snake_case` per project rules.

## Entity: `appearance_settings` (single row)

Site-wide system appearance. Single row keyed `id = 'default'` (mirrors
`ai_settings`).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` PK, default `'default'` | Always one row |
| `light_colors` | `jsonb` not null | Map of token name → color value for light mode |
| `dark_colors` | `jsonb` not null | Map of token name → color value for dark mode |
| `fonts` | `jsonb` not null | `{ body, display, mono }` = font catalog keys (R6) |
| `font_sizes` | `jsonb` not null | `{ base, h1, h2, h3 }` size tokens (R2) |
| `updated_by` | `uuid` → `users.id` `on delete set null` | Auditing |
| `updated_at` | `timestamptz` not null default now | |

**Validation** (Zod `@next-wiki/shared/appearance.ts`):
- Color values: valid CSS color (hex / rgb(a) / hsl(a)); reject malformed
  (FR-005). Token-name keys must belong to the canonical token set.
- `fonts.*`: must be a key in the bundled font catalog (FR-001b / R6).
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

## Entity: `markdown_themes`

A named CSS stylesheet controlling Markdown **typography/layout only**.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK default random | |
| `owner_user_id` | `uuid` nullable → `users.id` `on delete cascade` | NULL ⇒ built-in |
| `name` | `text` not null | |
| `css` | `text` not null | Sanitized CSS (R5) |
| `is_builtin` | `boolean` not null default false | Built-ins are read-only |
| `created_at` / `updated_at` | `timestamptz` not null default now | |

**Indexes / constraints**:
- Unique `(owner_user_id, name)` — duplicate name per owner rejected (FR-018).
  Built-ins (`owner_user_id IS NULL`) unique by name.
- Index on `owner_user_id`.

**Built-in seed rows** (P9 bounded registry, seeded at migration/seed time):
- `Default` — current `.prose` typography.
- `Wiki.js-inspired` — Wiki.js-like heading/blockquote/code/table treatment.

**Validation / rules**:
- `name` non-empty, length-bounded, unique per owner.
- `is_builtin = true` rows are immutable via the API (edit ⇒ offer copy, FR-014).
- `css` passes the sanitizer (allowlist typography props, no remote `url()` /
  `@import`, no color declarations — R5 / FR-011a / FR-017).
- A personal theme is created only by copying an existing theme (FR-013).

**Lifecycle / state**:
- `built-in (read-only)` → *copy* → `personal (editable)` → *edit/rename* →
  *activate* → *(delete ⇒ if active, fall back to Default — FR-018)*.

## Entity change: `users` (extend existing)

Add per-user active Markdown theme pointer (matches existing
`theme_preference` / `locale_preference` pattern).

| Column | Type | Notes |
|--------|------|-------|
| `active_markdown_theme_id` | `uuid` nullable → `markdown_themes.id` `on delete set null` | NULL ⇒ Default theme; reset to NULL when active theme deleted (FR-018) |

## Relationships

```text
users 1───* markdown_themes        (owner_user_id, personal themes)
users 1───0..1 markdown_themes      (active_markdown_theme_id)
markdown_themes (is_builtin)        owner_user_id = NULL, shared read-only
appearance_settings (1 row)         updated_by → users
site_settings (1 row)               updated_by → users; icon_asset_id → asset
```

## Derived / non-persistent

- **Resolved appearance CSS**: computed in the root layout from
  `appearance_settings` (or static defaults) and injected as `<style>` (R1).
- **Active theme CSS**: resolved from `users.active_markdown_theme_id` (or
  Default built-in) and injected scoped to the content container (R4).
- **Pagination state**: the `page` URL search param — not persisted (R9).

## Permissions

- `manage_appearance` capability (new) gates writes to `appearance_settings`,
  `site_settings`, and built-in theme management — evaluated through the
  existing `can()` chokepoint; no hardcoded admin bypass (Permission mandate).
- Markdown theme CRUD/activate is scoped to the **owning user**; reading
  built-ins is allowed for any authenticated user.
