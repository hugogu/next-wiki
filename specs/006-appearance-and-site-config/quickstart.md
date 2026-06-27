# Quickstart: Appearance & Site Configuration

Validation guide proving the feature works end-to-end. Assumes the monorepo dev
setup (see root `CLAUDE.md`).

> **Amended 2026-06-24 — theme ownership inverted** (see
> [swap-amendment.md](./swap-amendment.md)). Scenarios 1 and 3 below reflect the
> **as-built** UI: the admin surface edits free-form **system theme CSS**, and
> the per-user surface edits **structured reading-theme tokens** (colors / fonts
> / sizes). Scenarios 2 and 4 are unchanged.

## Prerequisites

```bash
pnpm install
pnpm db:migrate            # 0017–0019 (original appearance/site/theme) then 0020_swap_themes (inversion)
pnpm --filter @next-wiki/web dev    # http://localhost:3000
```

Sign in as an admin (a user with the `manage_appearance` capability).

## Scenario 1 — System theme CSS (Story 1, as-built)

1. Go to **Admin → Appearance** (`/admin/appearance`).
2. Enter free-form **system theme CSS** for the app shell (e.g.
   `.header { border-radius: 0; }`); Save.
3. Reload any page — the shell reflects the new CSS in both light and dark mode.
4. Verify no redeploy was needed (SC-002).
5. Add a `color:` declaration, a remote `url()`, or an `@import` → stripped /
   rejected by the sanitizer on save (R5 / FR-017).

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

## Scenario 3 — Reading-theme tokens (Story 3, as-built)

1. Go to **User Center → Reading theme** (`/user-center/reading-theme`).
2. Pick a **primary** color (light and dark), a **body font** (from the bundled
   catalog), and a **base font size**; Save.
3. Open an article — the reader (and editor preview) re-render with the chosen
   typography/colors in your active light/dark mode (FR-015, SC-004).
4. Enter a malformed color or unknown font → Save rejected, previous values
   stay (FR-005).
5. In a second browser/user, the same article is unchanged (FR-016).
6. **Reset to defaults** → reads fall back to the static defaults.

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
pnpm --filter @next-wiki/web test        # unit/integration: system-theme + user-appearance
                                         # + site-settings services, css sanitizer, pagination clamp
pnpm --filter @next-wiki/web test:e2e    # Playwright: scenarios 1–4 above
pnpm lint && pnpm typecheck
```

## References

- Data model: [data-model.md](./data-model.md)
- REST contracts: [contracts/](./contracts/)
- Design decisions: [research.md](./research.md)
