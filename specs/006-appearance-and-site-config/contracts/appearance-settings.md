# Contract: System Themes (REST)

> **Amended 2026-06-24 — theme ownership inverted** (see
> [swap-amendment.md](../swap-amendment.md)) and **2026-06-24 — single CSS
> replaced by a named list** (migration `0021_system_themes_list.sql`). The old
> single `GET/PUT /api/settings/appearance` endpoint is **removed**; system
> themes are now a named, admin-managed list under `/api/system-themes`, with one
> active theme tracked by `system_theme_settings.active_theme_id`. Per-user
> structured tokens live in [`user-appearance.md`](./user-appearance.md).

Base: `app/api/system-themes/route.ts` (+ `[id]/route.ts`, `active/route.ts`).
REST + OpenAPI, shared service (`src/server/services/system-theme.ts`), Zod in
`@next-wiki/shared/system-theme.ts`. Writes gated by `manage_appearance` via
`can()`. CSS is sanitized on save (`sanitizeSystemThemeCss`: layout/typography
allowlist incl. `@keyframes`; no color/background; no remote `url()`/`@import`).

## `GET /api/system-themes`

List system themes (built-ins + custom) and the active selection.

- **Auth**: authenticated.
- **200** → `SystemThemeListView`:

```jsonc
{
  "activeThemeId": "uuid|null",          // null ⇒ no system CSS injected
  "themes": [
    { "id": "uuid", "name": "Default",          "isBuiltin": true },
    { "id": "uuid", "name": "Wiki.js-inspired",  "isBuiltin": true },
    { "id": "uuid", "name": "Our Brand",         "isBuiltin": false }
  ]
}
```

## `POST /api/system-themes`

Create a custom theme by copying an existing one.

- **Auth**: `manage_appearance`.
- **Body**: `CreateSystemThemeInput` = `{ sourceThemeId: uuid, name: string }`.
- **201** → `SystemThemeView` (`{ id, name, css, isBuiltin: false }`).
- **400** duplicate/empty name; invalid source. **403** missing capability.

## `GET /api/system-themes/{id}`

Full CSS of one theme.

- **200** → `SystemThemeView` (`{ id, name, css, isBuiltin }`).
- **404** unknown id.

## `PUT /api/system-themes/{id}`

Update a custom theme's `name` and/or `css`.

- **Auth**: `manage_appearance`.
- **Body**: `UpdateSystemThemeInput` = `{ name?, css? }`. CSS sanitized on save.
- **200** → updated `SystemThemeView`.
- **400** duplicate/empty name; CSS rejected by sanitizer.
- **403/409** editing a built-in is blocked — response signals "create a copy".

## `DELETE /api/system-themes/{id}`

Delete a custom theme. If it was active, the active pointer clears (no system
CSS injected).

- **204**. **403** for built-ins.

## `PUT /api/system-themes/active`

Activate a theme for the whole site.

- **Auth**: `manage_appearance`.
- **Body**: `ActivateSystemThemeInput` = `{ themeId: uuid | null }` (null ⇒ none).
- Sets `system_theme_settings.active_theme_id`.
- **200** → `{ activeThemeId }`. The next render injects the active theme's CSS
  as `<style id="app-system-theme">`; no redeploy (SC-002).

## Test scenarios

1. GET list → ≥2 built-ins present; `activeThemeId` reflects the active row.
2. Copy a built-in → editable custom theme; edit + rename + save (sanitized).
3. PUT CSS with a `color:` / remote `url()` / `@import` → stripped/rejected (R5).
4. Edit a built-in → blocked with a copy hint.
5. Activate a theme → app shell reflects it on next render; activate `null` →
   shell reverts to no system CSS.
6. Delete the active theme → active pointer clears. Non-admin write → 403.
