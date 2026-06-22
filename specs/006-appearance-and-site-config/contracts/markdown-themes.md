# Contract: Markdown Themes (REST)

Base: `app/api/markdown-themes/route.ts` + `[id]/route.ts`. Service
`markdown-themes.ts`, Zod `@next-wiki/shared/markdown-theme.ts`. Personal theme
ops scoped to the owning user; built-ins read-only.

## `GET /api/markdown-themes`

List themes visible to the caller: all built-ins + the caller's personal themes.
Includes which one is active for the caller.

- **200** → `MarkdownThemeListView`:

```jsonc
{
  "activeThemeId": "uuid|null",          // null ⇒ Default built-in
  "themes": [
    { "id": "uuid", "name": "Default",          "isBuiltin": true,  "owned": false },
    { "id": "uuid", "name": "Wiki.js-inspired",  "isBuiltin": true,  "owned": false },
    { "id": "uuid", "name": "My Theme",          "isBuiltin": false, "owned": true }
  ]
}
```

## `GET /api/markdown-themes/{id}`

Returns full CSS content of a theme the caller may view (any built-in, or own).

- **200** → `{ id, name, css, isBuiltin, owned }` (FR-012).
- **403** if a personal theme owned by another user.

## `POST /api/markdown-themes`

Create a personal theme **by copying** an existing one (FR-013).

- **Body**: `{ sourceThemeId, name }`.
- **201** → created theme (`isBuiltin:false, owned:true`).
- **400** duplicate/empty name (FR-018); invalid source.

## `PUT /api/markdown-themes/{id}`

Update a personal theme's `css` and/or `name`.

- **Body**: `{ name?, css? }`.
- CSS sanitized on save: typography-only allowlist, no remote `url()`/`@import`,
  no color declarations (R5 / FR-011a / FR-017).
- **200** → updated theme.
- **400** duplicate/empty name; CSS rejected by sanitizer.
- **403/409** attempting to edit a built-in ⇒ blocked; response signals
  "create a copy instead" (FR-014).

## `DELETE /api/markdown-themes/{id}`

Delete a personal theme. If it was the caller's active theme, active falls back
to Default (FR-018).

- **204**. **403** for built-ins / others' themes.

## `PUT /api/markdown-themes/active`

Activate a theme for the caller.

- **Body**: `{ themeId | null }` (null ⇒ Default).
- Sets `users.active_markdown_theme_id`.
- **200** → `{ activeThemeId }`. Reader + editor preview re-render with it
  (FR-015, SC-004); other users unaffected (FR-016).

## Test scenarios

1. GET list → ≥2 built-ins present, each viewable in full CSS (FR-011/FR-012).
2. Edit built-in → blocked with copy hint (FR-014).
3. Copy built-in → editable personal theme; edit + rename + save (FR-013).
4. Save CSS with remote `url()` / `@import` / `color:` → sanitized/rejected (R5).
5. Activate personal theme → own reading view changes; second user unchanged
   (FR-015/FR-016).
6. Duplicate/empty rename → 400 (FR-018).
7. Delete active theme → falls back to Default (FR-018).
