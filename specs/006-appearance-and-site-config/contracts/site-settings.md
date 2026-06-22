# Contract: Site Information Settings (REST)

Base: `app/api/settings/site/route.ts`. Service `site-settings.ts`, Zod
`@next-wiki/shared/site.ts`. Writes gated by `manage_appearance`.

## `GET /api/settings/site`

- **Auth**: public-readable subset (name, icon URL, footer, filing info) so
  every page can render the header/footer.
- **200** → `SiteSettingsView`:

```jsonc
{
  "siteName": "next-wiki",
  "iconUrl": "/api/settings/site/icon",      // resolves to default or uploaded
  "hasCustomIcon": false,
  "footerCopyright": "© 2026 Example Org",
  "icp": { "number": "京ICP备12345678号", "url": "https://beian.miit.gov.cn/" },
  "publicSecurity": { "number": null, "url": "https://beian.mps.gov.cn/" }
}
```

## `PUT /api/settings/site`

- **Auth**: `manage_appearance`.
- **Body**: `UpdateSiteSettingsInput` — `siteName` (non-empty),
  `footerCopyright?`, `icpNumber?`, `icpUrl?`, `publicSecurityNumber?`,
  `publicSecurityUrl?`.
- **200** → updated `SiteSettingsView`.
- **400** empty `siteName` / invalid URL.
- **403** missing capability.

## `PUT /api/settings/site/icon` (icon upload)

- **Auth**: `manage_appearance`.
- **Body**: image upload (SVG/PNG, size-bounded); stored via existing blob/asset
  store; `site_settings.icon_asset_id` set.
- **200** → `{ iconUrl, hasCustomIcon: true }`.

## `DELETE /api/settings/site/icon`

- Clears `icon_asset_id` → reverts to the shipped default icon (FR-007).

## `GET /api/settings/site/icon`

- Serves the current icon bytes (uploaded or default). Used by
  `generateMetadata` favicon + header logo (R7).

## Behavior

- `siteName` and icon flow into Next.js `generateMetadata` → browser tab title
  + favicon across all routes (FR-006, SC-003).
- Footer (`Footer.tsx`) renders copyright always-if-set; ICP / 公安备案 lines
  only when their numbers are present, linked to the registry (FR-010, R8).

## Test scenarios

1. PUT siteName → header + `<title>` update on every route.
2. No custom icon → `GET /icon` returns the default; `hasCustomIcon=false`.
3. PUT icon → favicon + header logo use it; DELETE → reverts to default.
4. Set ICP number → footer shows linked filing; clear it → footer omits it.
5. PUT empty siteName → 400. PUT as non-admin → 403.
