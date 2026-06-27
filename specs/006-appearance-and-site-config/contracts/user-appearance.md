# Contract: User Reading-Theme Tokens (REST)

> **Added 2026-06-24 by the theme-ownership swap — see
> [swap-amendment.md](../swap-amendment.md).** This replaces the former
> per-user `markdown-themes` CSS list. Per-user appearance is now structured
> tokens; the admin system theme is free-form CSS (see
> [`appearance-settings.md`](./appearance-settings.md)).

Base: `app/api/user/appearance/route.ts`. Service
`src/server/services/user-appearance.ts`, Zod
`@next-wiki/shared/user-appearance.ts`. All operations are scoped to the
**caller** (the authenticated user); no admin capability required.

## `GET /api/user/appearance`

Returns the caller's reading-theme tokens, or the static defaults if the user
has not customized (no `user_appearance` row).

- **Auth**: authenticated (`bearer`).
- **200** → `UserAppearanceView`:

```jsonc
{
  "lightColors": { "color-primary": "#b45309", "color-background": "#fafaf9", "...": "..." },
  "darkColors":  { "color-primary": "#f59e0b", "color-background": "#1c1917", "...": "..." },
  "fonts":       { "body": "source-sans-3", "display": "crimson-pro", "mono": "system-mono" },
  "fontSizes":   { "base": "1rem", "h1": "2.25rem", "h2": "1.75rem", "h3": "1.375rem" },
  "fontCatalog": [ { "key": "source-sans-3", "label": "Source Sans 3", "stack": "..." }, "..." ],
  "tokenKeys":   [ "color-primary", "color-background", "..." ]
}
```

## `PUT /api/user/appearance`

Replace the caller's reading-theme tokens.

- **Auth**: authenticated (`bearer`).
- **Body**: `UpdateUserAppearanceInput` (`lightColors`, `darkColors`, `fonts`,
  `fontSizes`).
- **Validation** (FR-005): each color a valid CSS color; each font a catalog
  key (FR-001b / R6); each size a positive length; both color maps cover the
  full 13-token set (clarification Q1).
- **200** → updated `UserAppearanceView`.
- **400** `BAD_REQUEST` → invalid color/font/size; prior values unchanged.

## `DELETE /api/user/appearance`

Reset to defaults by deleting the caller's `user_appearance` row; subsequent
reads return the static defaults.

- **Auth**: authenticated (`bearer`).
- **200** → `UserAppearanceView` (the static defaults).

## Behavior

- On success, the next root-layout render injects the caller's tokens as
  `<style id="app-reading-theme">` scoped to `.prose.prose` (light set on
  `:root`-equivalent, dark set under `html.dark`); the active light/dark mode
  (`users.theme_preference`) selects which set applies. No redeploy (SC-002).
- Tokens are per-user: one user's change never affects another (FR-016).

## Test scenarios

1. PUT valid light+dark sets → 200, GET reflects them, the reader re-renders
   with the new primary color in the caller's active mode.
2. PUT malformed color → 400, GET still returns previous values (FR-005).
3. PUT unknown font key → 400 (FR-001b / R6).
4. PUT non-positive font size → 400.
5. Second user's reading view is unaffected by the first user's PUT (FR-016).
6. DELETE → reads return the static defaults.
