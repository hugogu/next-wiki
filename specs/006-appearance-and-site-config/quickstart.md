# Quickstart: Appearance & Site Configuration

Validation guide proving the feature works end-to-end. Assumes the monorepo dev
setup (see root `CLAUDE.md`).

## Prerequisites

```bash
pnpm install
pnpm db:migrate            # applies 0017 (appearance), 0018 (site), 0019 (markdown themes) + built-in theme seed
pnpm --filter @next-wiki/web dev    # http://localhost:3000
```

Sign in as an admin (a user with the `manage_appearance` capability).

## Scenario 1 — System appearance (Story 1)

1. Go to **Admin → Appearance → System**.
2. Change the **primary** color (light and dark), the **body font** (from the
   bundled catalog), and the **base font size**; Save.
3. Visit a reader page, the editor, and an admin page — all reflect the new
   primary color/font in both light and dark mode (toggle theme).
4. Verify no redeploy was needed (SC-002).
5. Enter a malformed color or unknown font → Save is rejected, previous values
   stay active (FR-005).

**Code audit** (SC-001):
```bash
# No raw color (hex/rgb/rgba/hsl/hsla), font-family, or font-size literals
rg -n "#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|font-family:|font-size:\s*[\d.]+(rem|em|px)" \
  apps/web/src/components apps/web/app \
  --glob '!**/ui/**' --glob '!**/globals.css'
# Expect: no color/font/font-size literals in feature (non-ui) components
```

## Scenario 2 — Site information (Story 2)

1. **Admin → Appearance → Site**.
2. Set **site name** → header + browser tab title update everywhere (FR-006).
3. With no custom icon, confirm the shipped default favicon renders (FR-007).
4. Upload a custom icon → favicon + header logo update; Delete → reverts to
   default (FR-008).
5. Set **copyright** and **ICP 备案号** (optionally 公安备案号) → footer shows
   them, ICP linked to `beian.miit.gov.cn` (FR-009/FR-010). Clear ICP → footer
   omits the compliance line (edge case).

## Scenario 3 — Markdown themes (Story 3)

1. **Admin → Appearance → Markdown Themes** (per-user surface).
2. See built-in **Default** and **Wiki.js-inspired**; open each to view full CSS
   (FR-011/FR-012).
3. Try to edit a built-in → blocked, offered "create a copy" (FR-014).
4. Copy one, edit typography (font size/spacing), rename, Save (FR-013).
   - Add `color:` / remote `url()` / `@import` → sanitized away on save (R5).
5. Activate the personal theme → an article re-renders with new typography
   immediately, without a full page reload; colors stay consistent with the
   system theme (FR-011a, SC-004).
6. In a second browser/user, the same article is unchanged (FR-016).
7. Delete the active theme → falls back to Default (FR-018).

## Scenario 4 — Pagination (Story 4)

1. Open a list with multiple pages (e.g. search results, transfers, history).
2. Confirm First / Previous / Next / Last + nearby page numbers (FR-020).
3. Click **Last** → URL gains `?page=N`; refresh stays on that page (FR-021).
4. On page 1, First/Prev disabled; on last page, Next/Last disabled (FR-022).
5. Manually set `?page=0`, `?page=abc`, `?page=99999` → clamped, no error
   (FR-023).
6. Confirm two different lists use the same component/behavior (FR-019, SC-005).
7. Confirm a single-page list hides the control (FR-024).

## Automated checks

```bash
pnpm --filter @next-wiki/web test        # unit/integration: settings services,
                                         # css sanitizer, theme registry, pagination clamp
pnpm --filter @next-wiki/web test:e2e    # Playwright: scenarios 1–4 above
pnpm lint && pnpm typecheck
```

## References

- Data model: [data-model.md](./data-model.md)
- REST contracts: [contracts/](./contracts/)
- Design decisions: [research.md](./research.md)
