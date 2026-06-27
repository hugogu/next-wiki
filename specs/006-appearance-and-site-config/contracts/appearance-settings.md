# Contract: System Theme Settings (REST)

> **Amended 2026-06-24 — see [swap-amendment.md](../swap-amendment.md).** The
> admin `/api/settings/appearance` endpoint no longer carries structured tokens;
> it now manages **free-form system theme CSS**. Per-user structured tokens moved
> to [`user-appearance.md`](./user-appearance.md).

Base: `app/api/settings/appearance/route.ts`. REST + OpenAPI, shared service
(`src/server/services/system-theme.ts`), Zod in
`@next-wiki/shared/system-theme.ts`. Writes gated by `manage_appearance` via
`can()`.

## `GET /api/settings/appearance`

Returns the admin-authored system theme CSS (or empty string when unset).

- **Auth**: **public-readable** (consistent with `GET /api/settings/site`). The
  CSS is already emitted into every rendered page's `<style id="app-system-theme">`,
  so gating the read adds no confidentiality. Page rendering reads the value
  server-side via the service; this endpoint primarily serves the admin editor.
- **200** → `SystemThemeView`:

```jsonc
{
  "css": "/* app-shell CSS authored by an admin */ .header { border-radius: 0; }"
}
```

## `PUT /api/settings/appearance`

Replace the system theme CSS.

- **Auth**: `manage_appearance` (FORBIDDEN otherwise).
- **Body**: `UpdateSystemThemeInput` (`{ css }`).
- **Validation**: `css` passes `sanitizeSystemThemeCss` — allowlisted properties
  (incl. layout / keyframes), no remote `url()` / `@import`, **no color
  declarations** (colors stay token-driven for light/dark consistency, R5 /
  FR-017); max size enforced.
- **200** → updated `SystemThemeView`.
- **400** `BAD_REQUEST` → CSS rejected by the sanitizer; prior value unchanged.
- **403** `FORBIDDEN` → missing capability.

## Behavior

- On success, the next root-layout render injects the new CSS unscoped as
  `<style id="app-system-theme">`; no redeploy (SC-002).
- The system CSS styles the app shell (outside `.prose`). Inside `.prose` it may
  affect layout/spacing/borders/shadows but never color variables (the sanitizer
  forbids color declarations); per-user reading-theme tokens always win there
  (specificity `.prose.prose`).

## Test scenarios

1. PUT valid CSS → 200, GET reflects it, rendered page shell shows the change.
2. PUT CSS with a `color:` declaration → stripped/rejected by the sanitizer.
3. PUT CSS with remote `url()` / `@import` → rejected (R5).
4. PUT as non-admin → 403.
