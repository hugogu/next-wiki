# Contract: System Appearance Settings (REST)

Base: `app/api/settings/appearance/route.ts`. REST + OpenAPI, shared service
(`src/server/services/appearance-settings.ts`), Zod in
`@next-wiki/shared/appearance.ts`. All writes gated by `manage_appearance` via
`can()`.

## `GET /api/settings/appearance`

Returns the active appearance settings (or static defaults if unset).

- **Auth**: **public-readable**, consistent with `GET /api/settings/site`. The
  view carries no secrets — these token values are already exposed in every
  rendered page's injected `<style>` (R1), so gating the read adds no
  confidentiality. (Page rendering itself reads the settings server-side via the
  service, not this endpoint; the endpoint primarily serves the admin editor.)
  Writes (`PUT`) remain gated by `manage_appearance`.
- **200** → `AppearanceSettingsView`:

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

## `PUT /api/settings/appearance`

Replace the appearance settings.

- **Auth**: `manage_appearance` (FORBIDDEN otherwise).
- **Body**: `UpdateAppearanceSettingsInput` (`lightColors`, `darkColors`,
  `fonts`, `fontSizes`).
- **Validation** (FR-005): each color a valid CSS color; each font a catalog
  key; each size a positive length; both color maps cover the full token set.
- **200** → updated `AppearanceSettingsView`.
- **400** `BAD_REQUEST` → invalid color/font/size; prior values unchanged.
- **403** `FORBIDDEN` → missing capability.

## Behavior

- On success, the next request's root-layout render injects the new tokens (R1);
  no redeploy (SC-002). Light and dark are independent value sets (FR-001a).
- A reset/clear action restores static defaults (delete row or PUT defaults).

## Test scenarios

1. PUT valid light+dark sets → 200, GET reflects them, rendered page uses new
   primary color in both modes.
2. PUT malformed color → 400, GET still returns previous values (FR-005).
3. PUT unknown font key → 400 (FR-001b / R6).
4. PUT non-positive font size → 400.
5. PUT as non-admin → 403.
