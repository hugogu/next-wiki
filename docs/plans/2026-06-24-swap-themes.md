# Swap User Reading Theme & Admin System Theme — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Invert which role owns which theme model. The per-user reading theme becomes structured tokens (light/dark colors + fonts + sizes); the admin system theme becomes a single site-wide free-form CSS sheet.

**Architecture:** Single Drizzle migration drops the old tables and adds the new ones. Each layer (shared Zod, server services, API, layout, UI, i18n, tests) is swapped atomically per commit so the suite stays green. Color-inheritance is preserved by CSS specificity: `.prose.prose { --color-* }` wins inside content; admin CSS wins outside.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, React 19, Next.js 16, postcss, custom i18n, Vitest, Playwright.

**Design doc:** `docs/plans/2026-06-24-swap-themes-design.md`

## Progress

- [ ] Task 1: DB migration — drop old appearance + markdown_themes tables, add system_theme_settings + user_appearance
- [ ] Task 2: Shared Zod — swap appearance/markdown-theme for user-appearance/system-theme
- [ ] Task 3: Server appearance package — rename tokens → user-tokens, swap style + sanitizer
- [ ] Task 4: Server — add user-appearance service (TDD)
- [ ] Task 5: Server — add system-theme service (TDD)
- [ ] Task 6: Server — drop old services and rewire site-settings import
- [ ] Task 7: API — update /api/settings/appearance, add /api/user/appearance, drop /api/markdown-themes/*
- [ ] Task 8: Layout — switch injection to the new services
- [ ] Task 9: Admin UI — replace AppearanceForm with SystemThemeForm + SystemThemePreview
- [ ] Task 10: User UI — replace MarkdownThemesManager with ReadingThemeForm + ReadingThemePreview + TokenEditors
- [ ] Task 11: i18n — update en.ts and zh.ts for the swapped panels
- [ ] Task 12: Tests — add new, drop obsolete, regenerate OpenAPI, final verification

---

## Task 1: DB migration — drop old + add new tables

**Files:**
- Modify: `apps/web/src/server/db/schema/index.ts` — drop `appearanceSettings` and `markdownThemes` exports; drop `users.activeMarkdownThemeId`; add `systemThemeSettings` and `userAppearance` exports
- Create: `apps/web/src/server/db/migrations/0020_swap_themes.sql`
- Modify: `apps/web/src/server/db/migrations/meta/_journal.json` — add idx 20 entry
- Create: `apps/web/src/server/db/migrations/meta/0020_snapshot.json` — full snapshot of schema after this change

**Step 1: Update the Drizzle schema**

In `apps/web/src/server/db/schema/index.ts`:

1. Remove the `activeMarkdownThemeId: uuid('active_markdown_theme_id'),` line from the `users` table (line 101).
2. Remove the `appearanceSettings` and `markdownThemes` table exports (lines 590-601 and 618-639).
3. Add the two new tables in their place (between `siteSettings` and the `// ---- System AI` comment):

```ts
/** Single-row, site-wide system theme CSS. Admin authors free-form CSS that is
 * sanitized on save and applied to the app shell (outside .prose). */
export const systemThemeSettings = pgTable('system_theme_settings', {
  id: text('id').primaryKey().default('default'),
  css: text('css').notNull().default(''),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Per-user reading-theme tokens. Absent row ⇒ user has not customized; the
 * root layout falls back to the static defaults. The user's light/dark mode
 * preference (users.themePreference) selects which color set applies. */
export const userAppearance = pgTable('user_appearance', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  lightColors: jsonb('light_colors').notNull(),
  darkColors: jsonb('dark_colors').notNull(),
  fonts: jsonb('fonts').notNull(),
  fontSizes: jsonb('font_sizes').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Step 2: Write the migration SQL**

Create `apps/web/src/server/db/migrations/0020_swap_themes.sql`:

```sql
DROP TABLE IF EXISTS "markdown_themes";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "active_markdown_theme_id";--> statement-breakpoint
DROP TABLE IF EXISTS "appearance_settings";--> statement-breakpoint
CREATE TABLE "system_theme_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"css" text DEFAULT '' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "system_theme_settings" ADD CONSTRAINT "system_theme_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "user_appearance" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"light_colors" jsonb NOT NULL,
	"dark_colors" jsonb NOT NULL,
	"fonts" jsonb NOT NULL,
	"font_sizes" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "user_appearance" ADD CONSTRAINT "user_appearance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
```

**Step 3: Append a journal entry and snapshot**

In `apps/web/src/server/db/migrations/meta/_journal.json`, append (after the 0019 entry):

```json
    {
      "idx": 20,
      "version": "7",
      "when": 1782390400000,
      "tag": "0020_swap_themes",
      "breakpoints": true
    }
```

For `0020_snapshot.json`, the easiest path is `pnpm --filter @next-wiki/web db:generate` and let drizzle-kit author it from the updated schema. Copy the generated `0001_…sql` (Drizzle will renumber to 0020 automatically) to `0020_swap_themes.sql`, fix the order if needed, and use the generated snapshot.

**Step 4: Verify migration applies cleanly against the test DB**

```bash
docker compose up -d --build
pnpm --filter @next-wiki/web db:migrate
```

Expected: migration 0020 applied; no errors. Check `\dt system_theme_settings` and `\dt user_appearance` in psql.

**Step 5: Typecheck + commit**

```bash
pnpm --filter @next-wiki/web typecheck
git add apps/web/src/server/db/schema/index.ts apps/web/src/server/db/migrations/0020_swap_themes.sql apps/web/src/server/db/migrations/meta/
git commit -m "feat(theme): swap DB tables for inverted theme ownership"
```

---

## Task 2: Shared Zod — swap appearance/markdown-theme for user-appearance/system-theme

**Files:**
- Create: `packages/shared/src/user-appearance.ts` — copy of the current `appearance.ts`, renamed
- Create: `packages/shared/src/system-theme.ts` — new schemas
- Delete: `packages/shared/src/appearance.ts`
- Delete: `packages/shared/src/markdown-theme.ts`
- Modify: `packages/shared/src/index.ts` — swap re-exports

**Step 1: Create `packages/shared/src/user-appearance.ts`**

Copy the full content of `packages/shared/src/appearance.ts` to `packages/shared/src/user-appearance.ts`, then update the header comment:

```ts
import { z } from 'zod';

/**
 * Per-user reading-theme tokens (006). One row per user. Structural validation
 * only — semantic checks (valid CSS color, known font-catalog key, complete
 * token coverage, positive sizes) live in the server service so the bundled
 * catalog/token registry stays server-side. See
 * `apps/web/src/server/services/user-appearance.ts`.
 */

export const userAppearanceColorsSchema = z.record(z.string(), z.string().min(1));
export type UserAppearanceColors = z.infer<typeof userAppearanceColorsSchema>;

export const userAppearanceFontsSchema = z.object({
  body: z.string().min(1),
  display: z.string().min(1),
  mono: z.string().min(1),
});
export type UserAppearanceFonts = z.infer<typeof userAppearanceFontsSchema>;

export const userAppearanceFontSizesSchema = z.object({
  base: z.string().min(1),
  h1: z.string().min(1),
  h2: z.string().min(1),
  h3: z.string().min(1),
});
export type UserAppearanceFontSizes = z.infer<typeof userAppearanceFontSizesSchema>;

export const updateUserAppearanceInputSchema = z.object({
  lightColors: userAppearanceColorsSchema,
  darkColors: userAppearanceColorsSchema,
  fonts: userAppearanceFontsSchema,
  fontSizes: userAppearanceFontSizesSchema,
});
export type UpdateUserAppearanceInput = z.infer<typeof updateUserAppearanceInputSchema>;

export const fontCatalogEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  stack: z.string(),
});
export type FontCatalogEntry = z.infer<typeof fontCatalogEntrySchema>;

export const userAppearanceViewSchema = z.object({
  lightColors: userAppearanceColorsSchema,
  darkColors: userAppearanceColorsSchema,
  fonts: userAppearanceFontsSchema,
  fontSizes: userAppearanceFontSizesSchema,
  fontCatalog: z.array(fontCatalogEntrySchema),
  tokenKeys: z.array(z.string()),
  isCustomized: z.boolean(),
});
export type UserAppearanceView = z.infer<typeof userAppearanceViewSchema>;
```

Note the new `isCustomized: z.boolean()` field on the view — true when the user has a row in `user_appearance`.

**Step 2: Create `packages/shared/src/system-theme.ts`**

```ts
import { z } from 'zod';

/**
 * Site-wide system theme CSS (006). Admin authors free-form CSS that is
 * sanitized on save by `sanitizeSystemThemeCss`. Applied to the app shell
 * (outside .prose). See `apps/web/src/server/services/system-theme.ts`.
 */

export const systemThemeViewSchema = z.object({
  css: z.string(),
  updatedAt: z.string().nullable(),
});
export type SystemThemeView = z.infer<typeof systemThemeViewSchema>;

export const updateSystemThemeInputSchema = z.object({
  css: z.string().max(50_000),
});
export type UpdateSystemThemeInput = z.infer<typeof updateSystemThemeInputSchema>;
```

**Step 3: Delete the old shared files**

```bash
rm packages/shared/src/appearance.ts packages/shared/src/markdown-theme.ts
```

**Step 4: Update `packages/shared/src/index.ts`**

Replace lines 12 and 14:

```ts
export * from './user-appearance';
export * from './site';
export * from './system-theme';
```

(Line 13 `export * from './site';` is unchanged.)

**Step 5: Typecheck + commit**

```bash
pnpm --filter @next-wiki/shared typecheck
pnpm --filter @next-wiki/web typecheck
git add packages/shared/src/
git commit -m "feat(shared): swap Zod schemas for inverted theme ownership"
```

---

## Task 3: Server appearance package — rename tokens, swap style, swap sanitizer

**Files:**
- Modify: `apps/web/src/server/appearance/tokens.ts` → rename to `user-tokens.ts`
- Modify: `apps/web/src/server/appearance/style.ts` — replace `buildAppearanceStyleCss` with `buildUserAppearanceCss`
- Modify: `apps/web/src/server/appearance/css-sanitize.ts` — swap `sanitizeThemeCss` for `sanitizeSystemThemeCss`
- Delete: `apps/web/src/server/appearance/builtin-themes.ts`
- Modify: `apps/web/src/server/appearance/css-sanitize.test.ts` — replace test cases

**Step 1: Move tokens.ts to user-tokens.ts**

```bash
git mv apps/web/src/server/appearance/tokens.ts apps/web/src/server/appearance/user-tokens.ts
```

In `user-tokens.ts`, update the header comment to describe per-user defaults:

```ts
/**
 * Canonical reading-theme token registry and default values for the per-user
 * reading theme (006). These mirror the static fallbacks in
 * `app/globals.css`. When a user has no row in `user_appearance` the layout
 * falls back to these defaults; otherwise the user's per-row values override
 * the custom properties inside `.prose` via `buildUserAppearanceCss`.
 */
```

No code changes — same exports (`COLOR_TOKEN_KEYS`, `DEFAULT_LIGHT_COLORS`, `DEFAULT_DARK_COLORS`, `FONT_CATALOG`, `FONT_CATALOG_KEYS`, `DEFAULT_FONTS`, `FONT_SIZE_KEYS`, `DEFAULT_FONT_SIZES`, etc.).

**Step 2: Replace `style.ts`**

```ts
import type { UserAppearanceColors, UserAppearanceFonts, UserAppearanceFontSizes } from '@next-wiki/shared';
import { COLOR_TOKEN_KEYS, FONT_SIZE_KEYS, FONT_SLOTS, resolveFontStack } from './user-tokens';

interface UserAppearanceValues {
  lightColors: UserAppearanceColors;
  darkColors: UserAppearanceColors;
  fonts: UserAppearanceFonts;
  fontSizes: UserAppearanceFontSizes;
}

function colorVars(colors: UserAppearanceColors): string {
  return COLOR_TOKEN_KEYS.map((key) => `--color-${key}:${colors[key]};`).join('');
}

function fontVars(fonts: UserAppearanceFonts): string {
  return FONT_SLOTS.map((slot) => {
    const stack = resolveFontStack(fonts[slot]);
    return stack ? `--font-${slot}:${stack};` : '';
  }).join('');
}

function sizeVars(sizes: UserAppearanceFontSizes): string {
  return FONT_SIZE_KEYS.map((key) => `--font-size-${key}:${sizes[key]};`).join('');
}

/**
 * Build the `<style>` body for a user's per-row reading-theme tokens. Light
 * values apply to `.prose.prose`; dark values apply to `html.dark .prose.prose`
 * (specificity 0,2,0 — wins over the static `:root` defaults inside content).
 * Returns an empty string if any required value is missing (caller skips
 * injection).
 */
export function buildUserAppearanceCss(values: UserAppearanceValues): string {
  const light = `.prose.prose{${colorVars(values.lightColors)}${fontVars(values.fonts)}${sizeVars(values.fontSizes)}}`;
  const dark = `html.dark .prose.prose{${colorVars(values.darkColors)}}`;
  return `${light}${dark}`;
}
```

**Step 3: Replace `css-sanitize.ts`**

```ts
import postcss from 'postcss';
import { DomainError } from '@/server/errors';

/**
 * Confine admin-authored system-theme CSS to layout/structure/typography
 * (006). Colors and backgrounds are NOT allowed because they belong to the
 * user's reading-theme tokens; the admin's CSS styles the app shell, not
 * content. The allowlist mirrors the previous user-CSS sanitizer but
 * additionally permits layout properties and `@keyframes` (with color
 * declarations inside keyframes stripped).
 */

const MAX_CSS_LENGTH = 50_000;
const ALLOWED_AT_RULES = new Set(['media', 'keyframes']);

function isAllowedProperty(prop: string): boolean {
  const p = prop.trim().toLowerCase();
  if (p.startsWith('--')) return false;
  if (p === 'color' || p.endsWith('-color') || p.startsWith('background')) return false;
  if (p.startsWith('border')) {
    return /^border(-(top|right|bottom|left))?-(width|style)$/.test(p) || p.includes('radius');
  }
  return (
    p.startsWith('font') ||
    p.startsWith('text') ||
    p === 'line-height' ||
    p === 'letter-spacing' ||
    p === 'word-spacing' ||
    p === 'white-space' ||
    p.startsWith('margin') ||
    p.startsWith('padding') ||
    p.startsWith('list-style') ||
    p === 'max-width' ||
    p === 'vertical-align' ||
    p === 'quotes' ||
    p === 'hyphens' ||
    p === 'tab-size' ||
    p === 'display' ||
    p === 'position' ||
    p === 'top' ||
    p === 'right' ||
    p === 'bottom' ||
    p === 'left' ||
    p === 'z-index' ||
    p.startsWith('flex') ||
    p.startsWith('grid') ||
    p === 'width' ||
    p === 'height' ||
    p.startsWith('max-') ||
    p.startsWith('min-') ||
    p === 'gap' ||
    p === 'row-gap' ||
    p === 'column-gap' ||
    p.startsWith('overflow') ||
    p.startsWith('transform') ||
    p.startsWith('transition') ||
    p.startsWith('animation') ||
    p === 'box-shadow' ||
    p === 'opacity' ||
    p === 'cursor' ||
    p === 'pointer-events' ||
    p === 'visibility'
  );
}

function isForbiddenValue(value: string): boolean {
  const v = value.toLowerCase();
  return (
    v.includes('url(') ||
    v.includes('expression(') ||
    v.includes('image-set') ||
    v.includes('javascript:') ||
    v.includes('@import')
  );
}

/** Sanitize on save. Returns cleaned CSS. */
export function sanitizeSystemThemeCss(css: string): string {
  if (css.length > MAX_CSS_LENGTH) {
    throw new DomainError('BAD_REQUEST', 'System theme stylesheet is too large');
  }
  let root;
  try {
    root = postcss.parse(css);
  } catch {
    throw new DomainError('BAD_REQUEST', 'System theme stylesheet is not valid CSS');
  }

  root.walkAtRules((at) => {
    if (!ALLOWED_AT_RULES.has(at.name.toLowerCase())) at.remove();
  });
  root.walkDecls((decl) => {
    if (!isAllowedProperty(decl.prop) || isForbiddenValue(decl.value)) decl.remove();
  });
  root.walkRules((rule) => {
    if (rule.nodes.length === 0) rule.remove();
  });

  return root.toString();
}
```

**Step 4: Update `css-sanitize.test.ts`**

Replace the file with cases for the new `sanitizeSystemThemeCss`:

```ts
import { describe, it, expect } from 'vitest';
import { DomainError } from '@/server/errors';
import { sanitizeSystemThemeCss } from '@/server/appearance/css-sanitize';

describe('sanitizeSystemThemeCss', () => {
  it('keeps allowlisted layout, typography, and border geometry', () => {
    const out = sanitizeSystemThemeCss(
      '.header { display: flex; gap: 1rem; padding: 0.5rem; border-bottom-width: 1px; border-bottom-style: solid; } h1 { font-size: 2rem; line-height: 1.2; }',
    );
    expect(out).toContain('display: flex');
    expect(out).toContain('gap: 1rem');
    expect(out).toContain('font-size: 2rem');
    expect(out).toContain('border-bottom-width: 1px');
  });

  it('strips color and background declarations', () => {
    const out = sanitizeSystemThemeCss(
      'p { color: red; background-color: blue; font-weight: 700; }',
    );
    expect(out).not.toContain('color');
    expect(out).not.toContain('background');
    expect(out).toContain('font-weight: 700');
  });

  it('strips remote url() and @import', () => {
    const out = sanitizeSystemThemeCss(
      '@import url("http://evil.test/x.css"); .x { background: url(http://evil.test/i.png); padding: 1rem; }',
    );
    expect(out.toLowerCase()).not.toContain('@import');
    expect(out.toLowerCase()).not.toContain('url(');
    expect(out).toContain('padding: 1rem');
  });

  it('keeps @keyframes but strips color declarations inside them', () => {
    const out = sanitizeSystemThemeCss(
      '@keyframes pulse { 0% { opacity: 0.4; color: red; } 100% { opacity: 1; } }',
    );
    expect(out).toContain('@keyframes');
    expect(out).toContain('opacity: 0.4');
    expect(out).not.toContain('color');
  });

  it('rejects oversized stylesheets', () => {
    expect(() => sanitizeSystemThemeCss('h1{font-size:1rem;}'.repeat(5000))).toThrow(DomainError);
  });

  it('rejects invalid CSS', () => {
    expect(() => sanitizeSystemThemeCss('this is not css }}}')).toThrow(DomainError);
  });
});
```

**Step 5: Delete the built-in themes file**

```bash
rm apps/web/src/server/appearance/builtin-themes.ts
```

**Step 6: Typecheck + commit**

```bash
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web test src/server/appearance/css-sanitize.test.ts
git add apps/web/src/server/appearance/
git commit -m "refactor(theme): swap sanitizer/style/tokens for inverted theme ownership"
```

---

## Task 4: Server — add user-appearance service (TDD)

**Files:**
- Create: `apps/web/src/server/services/user-appearance.ts`
- Create: `apps/web/src/server/services/user-appearance.test.ts`

**Step 1: Write the failing test**

`apps/web/src/server/services/user-appearance.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { UpdateUserAppearanceInput, UserAppearanceView } from '@next-wiki/shared';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as authService from '@/server/services/auth';
import { buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import {
  DEFAULT_DARK_COLORS,
  DEFAULT_FONT_SIZES,
  DEFAULT_FONTS,
  DEFAULT_LIGHT_COLORS,
} from '@/server/appearance/user-tokens';
import {
  getUserAppearance,
  resetUserAppearance,
  updateUserAppearance,
} from '@/server/services/user-appearance';

function validInput(): UpdateUserAppearanceInput {
  return {
    lightColors: { ...DEFAULT_LIGHT_COLORS },
    darkColors: { ...DEFAULT_DARK_COLORS },
    fonts: { ...DEFAULT_FONTS },
    fontSizes: { ...DEFAULT_FONT_SIZES },
  };
}

async function createUser() {
  const { userId } = await authService.register({ email: `ua-${Math.random().toString(36).slice(2)}@example.com`, password: 'Password123!' });
  return buildUserCtx(userId, 'reader');
}

describe('user-appearance service', () => {
  beforeAll(async () => {
    await db.delete(schema.userAppearance);
    await db.delete(schema.sessions);
    await db.delete(schema.users);
  });

  afterAll(async () => {
    await closeDb();
  });

  it('returns the static defaults with isCustomized=false when the user has no row', async () => {
    const ctx = await createUser();
    const view = await getUserAppearance(ctx);
    expect(view.isCustomized).toBe(false);
    expect(view.lightColors.primary).toBe(DEFAULT_LIGHT_COLORS.primary);
    expect(view.fonts.body).toBe(DEFAULT_FONTS.body);
    expect(view.fontCatalog.length).toBeGreaterThan(0);
    expect(view.tokenKeys).toContain('primary');
  });

  it('persists values, returns isCustomized=true, and reads them back', async () => {
    const ctx = await createUser();
    const input = validInput();
    input.lightColors.primary = '#0ea5e9';
    const view = await updateUserAppearance(ctx, input);
    expect(view.isCustomized).toBe(true);
    expect(view.lightColors.primary).toBe('#0ea5e9');

    const again = await getUserAppearance(ctx);
    expect(again.lightColors.primary).toBe('#0ea5e9');
  });

  it('rejects a malformed color in the input', async () => {
    const ctx = await createUser();
    const input = validInput();
    input.lightColors.primary = 'banana';
    await expect(updateUserAppearance(ctx, input)).rejects.toThrow(DomainError);
  });

  it('rejects an unknown font key', async () => {
    const ctx = await createUser();
    const input = validInput();
    input.fonts.body = 'comic-sans';
    await expect(updateUserAppearance(ctx, input)).rejects.toThrow(DomainError);
  });

  it('rejects a missing color token', async () => {
    const ctx = await createUser();
    const input = validInput();
    delete (input.lightColors as Record<string, string>).primary;
    await expect(updateUserAppearance(ctx, input)).rejects.toThrow(DomainError);
  });

  it('rejects a non-positive font size', async () => {
    const ctx = await createUser();
    const input = validInput();
    input.fontSizes.base = '0rem';
    await expect(updateUserAppearance(ctx, input)).rejects.toThrow(DomainError);
  });

  it('requires an authenticated user', async () => {
    const { actor, ...rest } = { actor: { kind: 'anonymous' as const } };
    void actor; void rest;
    await expect(
      updateUserAppearance({ actor: { kind: 'anonymous' } }, validInput()),
    ).rejects.toThrow(DomainError);
  });

  it('resets to defaults (deletes the row)', async () => {
    const ctx = await createUser();
    const input = validInput();
    input.lightColors.primary = '#abcdef';
    await updateUserAppearance(ctx, input);
    const view = await resetUserAppearance(ctx);
    expect(view.isCustomized).toBe(false);
    expect(view.lightColors.primary).toBe(DEFAULT_LIGHT_COLORS.primary);
  });

  it('isolates rows between users', async () => {
    const a = await createUser();
    const b = await createUser();
    const input = validInput();
    input.lightColors.primary = '#aaaaaa';
    await updateUserAppearance(a, input);
    const bView = await getUserAppearance(b);
    expect(bView.isCustomized).toBe(false);
    expect(bView.lightColors.primary).toBe(DEFAULT_LIGHT_COLORS.primary);
  });
});
```

**Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @next-wiki/web test src/server/services/user-appearance.test.ts
```

Expected: FAIL with "Cannot find module '@/server/services/user-appearance'".

**Step 3: Implement the service**

`apps/web/src/server/services/user-appearance.ts`:

```ts
import { eq } from 'drizzle-orm';
import type {
  UserAppearanceColors,
  UserAppearanceFonts,
  UserAppearanceFontSizes,
  UserAppearanceView,
  UpdateUserAppearanceInput,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import {
  COLOR_TOKEN_KEYS,
  DEFAULT_DARK_COLORS,
  DEFAULT_FONT_SIZES,
  DEFAULT_FONTS,
  DEFAULT_LIGHT_COLORS,
  FONT_CATALOG,
  FONT_CATALOG_KEYS,
  FONT_SIZE_KEYS,
  FONT_SLOTS,
} from '@/server/appearance/user-tokens';

const HEX = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/;
const HSL = /^hsla?\(\s*\d{1,3}(deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/;
const LENGTH = /^\d*\.?\d+(rem|em|px)$/;

export function isValidCssColor(value: string): boolean {
  const v = value.trim();
  return HEX.test(v) || RGB.test(v) || HSL.test(v);
}

export function isValidFontSize(value: string): boolean {
  const v = value.trim();
  return LENGTH.test(v) && parseFloat(v) > 0;
}

function requireUserId(ctx: PermCtx): string {
  const id = getActorUserId(ctx);
  if (!id) throw new DomainError('UNAUTHORIZED', 'Sign in to manage your reading theme');
  return id;
}

function assertColors(colors: UserAppearanceColors, label: string): void {
  for (const key of COLOR_TOKEN_KEYS) {
    const value = colors[key];
    if (value === undefined) {
      throw new DomainError('BAD_REQUEST', `Missing ${label} color token "${key}"`);
    }
    if (!isValidCssColor(value)) {
      throw new DomainError('BAD_REQUEST', `Invalid ${label} color for "${key}": ${value}`);
    }
  }
}

function assertFonts(fonts: UserAppearanceFonts): void {
  for (const slot of FONT_SLOTS) {
    const key = fonts[slot];
    if (!FONT_CATALOG_KEYS.includes(key)) {
      throw new DomainError('BAD_REQUEST', `Unknown font for "${slot}": ${key}`);
    }
  }
}

function assertFontSizes(sizes: UserAppearanceFontSizes): void {
  for (const key of FONT_SIZE_KEYS) {
    const value = sizes[key];
    if (!isValidFontSize(value)) {
      throw new DomainError('BAD_REQUEST', `Invalid font size for "${key}": ${value}`);
    }
  }
}

export function validateUserAppearanceInput(input: UpdateUserAppearanceInput): void {
  assertColors(input.lightColors, 'light');
  assertColors(input.darkColors, 'dark');
  assertFonts(input.fonts);
  assertFontSizes(input.fontSizes);
}

const DEFAULTS = {
  lightColors: DEFAULT_LIGHT_COLORS,
  darkColors: DEFAULT_DARK_COLORS,
  fonts: DEFAULT_FONTS,
  fontSizes: DEFAULT_FONT_SIZES,
};

function toView(values: typeof DEFAULTS, isCustomized: boolean): UserAppearanceView {
  return {
    lightColors: values.lightColors,
    darkColors: values.darkColors,
    fonts: values.fonts,
    fontSizes: values.fontSizes,
    fontCatalog: FONT_CATALOG,
    tokenKeys: [...COLOR_TOKEN_KEYS],
    isCustomized,
  };
}

/** Read the user's per-row tokens. Falls back to the static defaults when no row. */
export async function getUserAppearance(ctx: PermCtx): Promise<UserAppearanceView> {
  const userId = requireUserId(ctx);
  const row = await db.query.userAppearance.findFirst({ where: eq(schema.userAppearance.userId, userId) });
  if (!row) return toView(DEFAULTS, false);
  return toView(
    {
      lightColors: row.lightColors as UserAppearanceColors,
      darkColors: row.darkColors as UserAppearanceColors,
      fonts: row.fonts as UserAppearanceFonts,
      fontSizes: row.fontSizes as UserAppearanceFontSizes,
    },
    true,
  );
}

/** Upsert the user's per-row tokens. Validates input. */
export async function updateUserAppearance(
  ctx: PermCtx,
  input: UpdateUserAppearanceInput,
): Promise<UserAppearanceView> {
  const userId = requireUserId(ctx);
  validateUserAppearanceInput(input);

  await db
    .insert(schema.userAppearance)
    .values({
      userId,
      lightColors: input.lightColors,
      darkColors: input.darkColors,
      fonts: input.fonts,
      fontSizes: input.fontSizes,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.userAppearance.userId,
      set: {
        lightColors: input.lightColors,
        darkColors: input.darkColors,
        fonts: input.fonts,
        fontSizes: input.fontSizes,
        updatedAt: new Date(),
      },
    });

  return toView(input, true);
}

/** Delete the user's per-row tokens; falls back to the static defaults. */
export async function resetUserAppearance(ctx: PermCtx): Promise<UserAppearanceView> {
  const userId = requireUserId(ctx);
  await db.delete(schema.userAppearance).where(eq(schema.userAppearance.userId, userId));
  return toView(DEFAULTS, false);
}
```

**Step 4: Run the test**

```bash
pnpm --filter @next-wiki/web test src/server/services/user-appearance.test.ts
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add apps/web/src/server/services/user-appearance.ts apps/web/src/server/services/user-appearance.test.ts
git commit -m "feat(theme): add user-appearance service for per-user reading tokens"
```

---

## Task 5: Server — add system-theme service (TDD)

**Files:**
- Create: `apps/web/src/server/services/system-theme.ts`
- Create: `apps/web/src/server/services/system-theme.test.ts`

**Step 1: Write the failing test**

`apps/web/src/server/services/system-theme.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as authService from '@/server/services/auth';
import { buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import {
  getSystemThemeCss,
  getSystemThemeView,
  updateSystemThemeCss,
} from '@/server/services/system-theme';

async function createAdmin() {
  const { userId } = await authService.register({ email: `st-${Math.random().toString(36).slice(2)}@example.com`, password: 'Password123!' });
  await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, userId));
  return buildUserCtx(userId, 'admin');
}

describe('system-theme service', () => {
  beforeAll(async () => {
    await db.delete(schema.systemThemeSettings);
    await db.delete(schema.sessions);
    await db.delete(schema.users);
  });

  afterAll(async () => {
    await closeDb();
  });

  it('returns an empty CSS string and null updatedAt when unset', async () => {
    const view = await getSystemThemeView();
    expect(view.css).toBe('');
    expect(view.updatedAt).toBeNull();
    expect(await getSystemThemeCss()).toBe('');
  });

  it('persists admin CSS and returns it raw (sanitization happens on save)', async () => {
    const ctx = await createAdmin();
    const css = '.header { display: flex; padding: 0.5rem; }';
    const view = await updateSystemThemeCss(ctx, { css });
    expect(view.css).toBe(css);
    expect(view.updatedAt).not.toBeNull();
    expect(await getSystemThemeCss()).toBe(css);
  });

  it('rejects oversized stylesheets', async () => {
    const ctx = await createAdmin();
    const big = 'h1{font-size:1rem;}'.repeat(6000); // > 50KB
    await expect(updateSystemThemeCss(ctx, { css: big })).rejects.toThrow(DomainError);
  });

  it('rejects invalid CSS', async () => {
    const ctx = await createAdmin();
    await expect(updateSystemThemeCss(ctx, { css: '}}} not css' })).rejects.toThrow(DomainError);
  });

  it('rejects color/background/url() in the CSS', async () => {
    const ctx = await createAdmin();
    const view = await updateSystemThemeCss(ctx, {
      css: '.x { color: red; background: url(http://evil); padding: 1rem; }',
    });
    expect(view.css).not.toContain('color');
    expect(view.css).not.toContain('background');
    expect(view.css).not.toContain('url(');
    expect(view.css).toContain('padding: 1rem');
  });

  it('rejects writes from a non-admin', async () => {
    const { userId } = await authService.register({ email: `st-r-${Date.now()}@example.com`, password: 'Password123!' });
    const ctx = buildUserCtx(userId, 'reader');
    await expect(updateSystemThemeCss(ctx, { css: '.x { padding: 1rem; }' })).rejects.toThrow(DomainError);
  });
});
```

**Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @next-wiki/web test src/server/services/system-theme.test.ts
```

Expected: FAIL with "Cannot find module '@/server/services/system-theme'".

**Step 3: Implement the service**

`apps/web/src/server/services/system-theme.ts`:

```ts
import { eq } from 'drizzle-orm';
import type { SystemThemeView, UpdateSystemThemeInput } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { sanitizeSystemThemeCss } from '@/server/appearance/css-sanitize';

const SETTINGS_ID = 'default';

function assertCanManage(ctx: PermCtx): void {
  if (ctx.actor.kind !== 'user' || !can(ctx, 'manage_appearance', { kind: 'appearance' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage the system theme');
  }
}

type Row = typeof schema.systemThemeSettings.$inferSelect;

async function getRow(): Promise<Row | null> {
  return (await db.query.systemThemeSettings.findFirst({ where: eq(schema.systemThemeSettings.id, SETTINGS_ID) })) ?? null;
}

/** Raw CSS for injection. Empty string when no row. */
export async function getSystemThemeCss(): Promise<string> {
  return (await getRow())?.css ?? '';
}

export async function getSystemThemeView(): Promise<SystemThemeView> {
  const row = await getRow();
  return {
    css: row?.css ?? '',
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

/** Replace the admin-authored CSS. Sanitizes on save. Requires `manage_appearance`. */
export async function updateSystemThemeCss(
  ctx: PermCtx,
  input: UpdateSystemThemeInput,
): Promise<SystemThemeView> {
  assertCanManage(ctx);
  const sanitized = sanitizeSystemThemeCss(input.css);

  const values = {
    id: SETTINGS_ID,
    css: sanitized,
    updatedBy: getActorUserId(ctx),
    updatedAt: new Date(),
  };
  await db
    .insert(schema.systemThemeSettings)
    .values(values)
    .onConflictDoUpdate({
      target: schema.systemThemeSettings.id,
      set: { css: sanitized, updatedBy: values.updatedBy, updatedAt: values.updatedAt },
    });

  return { css: sanitized, updatedAt: values.updatedAt.toISOString() };
}
```

**Step 4: Run the test**

```bash
pnpm --filter @next-wiki/web test src/server/services/system-theme.test.ts
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add apps/web/src/server/services/system-theme.ts apps/web/src/server/services/system-theme.test.ts
git commit -m "feat(theme): add system-theme service for admin-authored CSS"
```

---

## Task 6: Server — drop old services and rewire site-settings import

**Files:**
- Delete: `apps/web/src/server/services/appearance-settings.ts`
- Delete: `apps/web/src/server/services/appearance-settings.test.ts`
- Delete: `apps/web/src/server/services/markdown-themes.ts`
- Delete: `apps/web/src/server/services/markdown-themes.test.ts`
- Modify: `apps/web/src/server/services/site-settings.ts` — drop the import from `appearance-settings` (only `assertCanManageAppearance` is used); inline a local helper that calls `can` directly so the file no longer depends on the deleted module

**Step 1: Drop the obsolete service files**

```bash
rm apps/web/src/server/services/appearance-settings.ts
rm apps/web/src/server/services/appearance-settings.test.ts
rm apps/web/src/server/services/markdown-themes.ts
rm apps/web/src/server/services/markdown-themes.test.ts
```

**Step 2: Inline the permission helper in `site-settings.ts`**

Replace the import (line 7):

```ts
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
```

Add a local helper (after the `SETTINGS_ID` constant):

```ts
function assertCanManage(ctx: PermCtx): void {
  if (ctx.actor.kind !== 'user' || !can(ctx, 'manage_appearance', { kind: 'appearance' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage site settings');
  }
}
```

Replace every `assertCanManageAppearance(ctx)` call in the file (in `updateSiteSettings`, `setIcon`, `clearIcon`) with `assertCanManage(ctx)`.

**Step 3: Typecheck + commit**

```bash
pnpm --filter @next-wiki/web typecheck
git add -A
git commit -m "refactor(theme): drop old appearance/markdown services and rewire site-settings"
```

Expected: typecheck passes (the layout, API, and UI still call the old names — those will be fixed in subsequent tasks, but `apps/web/src/server` itself should typecheck once the dead imports are gone).

**Note:** the typecheck will fail at this step because the API routes and layout still import the deleted modules. The remaining tasks swap those. To keep this commit green, defer the typecheck verification until Task 8 (after the layout is updated) — but the service-level file changes can be committed now. If you want strict per-commit typecheck, run `pnpm --filter @next-wiki/web typecheck src/server` (filtering at the source tree) instead of the full check.

---

## Task 7: API — update /api/settings/appearance, add /api/user/appearance, drop /api/markdown-themes/*

**Files:**
- Modify: `apps/web/app/api/settings/appearance/route.ts` — swap to system-theme service
- Create: `apps/web/app/api/user/appearance/route.ts` — new per-user endpoint
- Delete: `apps/web/app/api/markdown-themes/route.ts`
- Delete: `apps/web/app/api/markdown-themes/[id]/route.ts`
- Delete: `apps/web/app/api/markdown-themes/active/route.ts`
- Delete: `apps/web/app/api/markdown-themes/` (empty directory)

**Step 1: Rewrite `/api/settings/appearance/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { updateSystemThemeInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { getSystemThemeView, updateSystemThemeCss } from '@/server/services/system-theme';

/**
 * @openapi
 * @summary Get system theme CSS
 * @description Returns the admin-authored system theme CSS (or empty string when unset). Public-readable.
 * @tag Appearance
 */
export async function GET() {
  try {
    return NextResponse.json(await getSystemThemeView());
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Update system theme CSS
 * @description Replaces the admin-authored CSS. Sanitized on save. Requires manage_appearance.
 * @tag Appearance
 * @auth bearer
 * @body UpdateSystemThemeInput
 */
export async function PUT(request: NextRequest) {
  const parsed = parseJson(updateSystemThemeInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateSystemThemeCss(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
```

**Step 2: Create `/api/user/appearance/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { updateUserAppearanceInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseJson } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { getUserAppearance, resetUserAppearance, updateUserAppearance } from '@/server/services/user-appearance';

/**
 * @openapi
 * @summary Get the caller's reading-theme tokens
 * @description Returns the per-user reading-theme tokens (or defaults if the user has not customized). Authenticated.
 * @tag Appearance
 * @auth bearer
 */
export async function GET() {
  try {
    return NextResponse.json(await getUserAppearance(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Update the caller's reading-theme tokens
 * @description Replaces the per-user reading-theme tokens. Authenticated.
 * @tag Appearance
 * @auth bearer
 * @body UpdateUserAppearanceInput
 */
export async function PUT(request: NextRequest) {
  const parsed = parseJson(updateUserAppearanceInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await updateUserAppearance(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Reset the caller's reading-theme tokens to defaults
 * @description Deletes the per-user row; subsequent reads return the static defaults. Authenticated.
 * @tag Appearance
 * @auth bearer
 */
export async function DELETE() {
  try {
    return NextResponse.json(await resetUserAppearance(await createApiContext()));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
```

**Step 3: Delete the markdown-themes API directory**

```bash
rm -rf apps/web/app/api/markdown-themes
```

**Step 4: Typecheck + commit**

```bash
pnpm --filter @next-wiki/web typecheck
git add -A
git commit -m "feat(api): swap /api/settings/appearance to system CSS, add /api/user/appearance"
```

---

## Task 8: Layout — switch injection to the new services

**Files:**
- Modify: `apps/web/app/layout.tsx` — replace the appearance/markdown theme injection with the system CSS + per-user reading tokens

**Step 1: Replace the layout body**

In `apps/web/app/layout.tsx`, replace lines 9-13:

```ts
import { getCurrentActor } from '@/server/services/auth';
import { getSystemThemeCss } from '@/server/services/system-theme';
import { getUserAppearance } from '@/server/services/user-appearance';
import { buildUserAppearanceCss } from '@/server/appearance/style';
```

Replace lines 33-35:

```ts
  const systemCss = await getSystemThemeCss();
  const userId = actor.kind === 'user' ? actor.userId : null;
  let readingThemeCss = '';
  if (userId) {
    const userAppearance = await getUserAppearance({ actor });
    if (userAppearance.isCustomized) {
      readingThemeCss = buildUserAppearanceCss(userAppearance);
    }
  }
```

Replace lines 60-61 (the two `<style>` tags):

```tsx
        <style id="app-system-theme" dangerouslySetInnerHTML={{ __html: systemCss }} />
        <style id="app-reading-theme" dangerouslySetInnerHTML={{ __html: readingThemeCss }} />
```

**Step 2: Typecheck + commit**

```bash
pnpm --filter @next-wiki/web typecheck
git add apps/web/app/layout.tsx
git commit -m "feat(layout): inject system CSS and per-user reading tokens"
```

---

## Task 9: Admin UI — replace AppearanceForm with SystemThemeForm + SystemThemePreview

**Files:**
- Create: `apps/web/src/components/admin/appearance/SystemThemeForm.tsx`
- Create: `apps/web/src/components/admin/appearance/SystemThemePreview.tsx`
- Delete: `apps/web/src/components/admin/appearance/AppearanceForm.tsx`
- Delete: `apps/web/src/components/admin/appearance/AppearancePreview.tsx`
- Modify: `apps/web/app/(admin)/admin/appearance/page.tsx` — call `getSystemThemeView()` and render `SystemThemeForm`

**Step 1: Write `SystemThemeForm.tsx`**

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useTranslation } from '@/i18n/client';
import { SystemThemePreview } from './SystemThemePreview';

export function SystemThemeForm({ initial }: { initial: { css: string; updatedAt: string | null } }) {
  const { t } = useTranslation();
  const [css, setCss] = useState(initial.css);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = css !== initial.css;
  const previewCss = useMemo(() => css, [css]);

  async function onSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/settings/appearance', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ css }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.message ?? t('admin.appearance.error.generic'));
        return;
      }
      const data = await response.json();
      setCss(data.css);
      setSaved(true);
    } catch {
      setError(t('admin.appearance.error.generic'));
    } finally {
      setSaving(false);
    }
  }

  async function onReset() {
    setCss('');
  }

  return (
    <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
      <div className="space-y-sm">
        <p className="text-sm text-muted">{t('admin.appearance.css.hint')}</p>
        <textarea
          value={css}
          onChange={(e) => setCss(e.target.value)}
          spellCheck={false}
          rows={24}
          className="w-full rounded-md border border-border bg-surface p-md font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
          aria-label={t('admin.appearance.css.label')}
        />

        {error && <Alert>{error}</Alert>}
        {saved && (
          <div className="rounded-md bg-primary/10 p-md text-sm text-primary" role="status">
            {t('admin.appearance.saved')}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-sm">
          <Button onClick={onSave} disabled={saving || !dirty}>
            {saving ? t('admin.appearance.saving') : t('admin.appearance.save')}
          </Button>
          <Button variant="ghost" onClick={onReset} disabled={saving || !css}>
            {t('admin.appearance.css.reset')}
          </Button>
        </div>
      </div>

      <div className="lg:sticky lg:top-md lg:self-start">
        <SystemThemePreview css={previewCss} />
      </div>
    </div>
  );
}
```

**Step 2: Write `SystemThemePreview.tsx`**

```tsx
'use client';

import { useId } from 'react';
import { ProsePreviewSample } from '@/components/appearance/ProsePreviewSample';
import { useTranslation } from '@/i18n/client';

/**
 * Live preview of the admin's system-theme CSS. The candidate CSS is injected
 * into a sandboxed wrapper that renders a small app-shell mock (header,
 * sidebar, button, card) plus the shared `.prose` sample. Colors come from the
 * active reading-theme tokens — the admin's CSS controls layout/structure.
 */
export function SystemThemePreview({ css }: { css: string }) {
  const { t } = useTranslation();
  const scopeClass = `stp-${useId().replace(/[:]/g, '')}`;
  const scopedCss = `.${scopeClass} {\n${css}\n}`;

  return (
    <div className="space-y-sm">
      <h2 className="font-display text-lg font-semibold">{t('admin.appearance.preview.title')}</h2>
      <style dangerouslySetInnerHTML={{ __html: scopedCss }} />
      <div
        className={`${scopeClass} overflow-hidden rounded-lg border border-border-strong p-md`}
        style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-foreground)' }}
        data-system-theme-preview
      >
        <div className="mb-md flex items-center justify-between border-b border-border pb-sm">
          <span className="font-display text-sm font-semibold">next-wiki</span>
          <span className="rounded-md bg-primary px-md py-xs text-xs text-primary-text">
            {t('admin.appearance.preview.button')}
          </span>
        </div>
        <ProsePreviewSample />
      </div>
    </div>
  );
}
```

**Step 3: Update the admin page**

`apps/web/app/(admin)/admin/appearance/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { SystemThemeForm } from '@/components/admin/appearance/SystemThemeForm';
import { AppearanceNav } from '@/components/admin/appearance/AppearanceNav';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import { getSystemThemeView } from '@/server/services/system-theme';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AdminAppearancePage() {
  const actor = await getCurrentActor();
  if (!can({ actor }, 'manage_appearance', { kind: 'appearance' })) notFound();

  const view = await getSystemThemeView();
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.appearance.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.appearance.description')}</p>
        </div>
        <AppearanceNav />
        <SystemThemeForm initial={view} />
      </div>
    </Layout>
  );
}
```

**Step 4: Delete the obsolete admin components**

```bash
rm apps/web/src/components/admin/appearance/AppearanceForm.tsx
rm apps/web/src/components/admin/appearance/AppearancePreview.tsx
```

**Step 5: Typecheck + commit**

```bash
pnpm --filter @next-wiki/web typecheck
git add -A
git commit -m "feat(admin): replace color-picker appearance form with CSS editor"
```

---

## Task 10: User UI — replace MarkdownThemesManager with ReadingThemeForm + ReadingThemePreview + TokenEditors

**Files:**
- Create: `apps/web/src/components/appearance/TokenEditors.tsx` — shared color/font/size editors
- Create: `apps/web/src/components/appearance/ReadingThemePreview.tsx`
- Create: `apps/web/src/components/user-center/ReadingThemeForm.tsx`
- Delete: `apps/web/src/components/appearance/MarkdownThemePreview.tsx`
- Delete: `apps/web/src/components/user-center/MarkdownThemesManager.tsx`
- Modify: `apps/web/app/(user)/user-center/reading-theme/page.tsx` — render `ReadingThemeForm`

**Step 1: Write `TokenEditors.tsx`**

This module exports three sub-components that the form composes. Each editor
manages its own slice of state via callbacks.

```tsx
'use client';

import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { FontCatalogEntry, UserAppearanceColors, UserAppearanceFonts, UserAppearanceFontSizes } from '@next-wiki/shared';

/** A single color row: native color picker + free-text input (for rgba/hsl). */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const swatch = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000';
  return (
    <label className="flex items-center justify-between gap-sm text-sm">
      <span className="font-mono text-xs text-muted">{label}</span>
      <span className="flex items-center gap-xs">
        <input
          type="color"
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} swatch`}
          className="h-7 w-8 shrink-0 cursor-pointer rounded border border-border bg-surface p-0"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="max-w-[9rem] font-mono"
          aria-label={label}
        />
      </span>
    </label>
  );
}

/** All 13 color tokens for one mode (light or dark). */
export function ColorTokenGrid({
  title,
  colors,
  tokenKeys,
  onChange,
  labelFor,
}: {
  title: string;
  colors: UserAppearanceColors;
  tokenKeys: string[];
  onChange: (next: UserAppearanceColors) => void;
  labelFor: (key: string) => string;
}) {
  return (
    <section className="space-y-sm">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <div className="grid grid-cols-1 gap-xs sm:grid-cols-2">
        {tokenKeys.map((key) => (
          <ColorField
            key={key}
            label={labelFor(key)}
            value={colors[key] ?? ''}
            onChange={(next) => onChange({ ...colors, [key]: next })}
          />
        ))}
      </div>
    </section>
  );
}

export function FontSlotEditors({
  fonts,
  catalog,
  onChange,
}: {
  fonts: UserAppearanceFonts;
  catalog: FontCatalogEntry[];
  onChange: (next: UserAppearanceFonts) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-sm sm:grid-cols-3">
      {(Object.keys(fonts) as Array<keyof UserAppearanceFonts>).map((slot) => (
        <label key={slot} className="space-y-xs text-sm">
          <span className="block font-medium capitalize">{slot}</span>
          <Select
            value={fonts[slot]}
            onChange={(e) => onChange({ ...fonts, [slot]: e.target.value })}
            aria-label={`font ${slot}`}
          >
            {catalog.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </Select>
        </label>
      ))}
    </div>
  );
}

export function FontSizeEditors({
  sizes,
  onChange,
}: {
  sizes: UserAppearanceFontSizes;
  onChange: (next: UserAppearanceFontSizes) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-sm sm:grid-cols-4">
      {(Object.keys(sizes) as Array<keyof UserAppearanceFontSizes>).map((key) => (
        <label key={key} className="space-y-xs text-sm">
          <span className="block font-mono text-xs text-muted">{key}</span>
          <Input
            value={sizes[key]}
            onChange={(e) => onChange({ ...sizes, [key]: e.target.value })}
            className="font-mono"
            aria-label={`font-size ${key}`}
          />
        </label>
      ))}
    </div>
  );
}
```

**Step 2: Write `ReadingThemePreview.tsx`**

```tsx
'use client';

import { useId, type CSSProperties } from 'react';
import { ProsePreviewSample } from './ProsePreviewSample';
import { useTranslation } from '@/i18n/client';
import {
  COLOR_TOKEN_KEYS,
  FONT_SIZE_KEYS,
  FONT_SLOTS,
  resolveFontStack,
} from '@/server/appearance/user-tokens';
import type { UserAppearanceColors, UserAppearanceFonts, UserAppearanceFontSizes } from '@next-wiki/shared';

/** Live preview of the per-user reading theme. The candidate tokens are
 * applied to the preview surface via inline CSS custom properties — the
 * `.prose` sample reads them and updates immediately. */
export function ReadingThemePreview({
  lightColors,
  darkColors,
  fonts,
  fontSizes,
  mode,
  onToggleMode,
  fontCatalog,
}: {
  lightColors: UserAppearanceColors;
  darkColors: UserAppearanceColors;
  fonts: UserAppearanceFonts;
  fontSizes: UserAppearanceFontSizes;
  mode: 'light' | 'dark';
  onToggleMode: (m: 'light' | 'dark') => void;
  fontCatalog: { key: string; stack: string }[];
}) {
  const { t } = useTranslation();
  const scopeId = useId().replace(/[:]/g, '');
  const colors = mode === 'light' ? lightColors : darkColors;
  const stackFor = (key: string) => fontCatalog.find((f) => f.key === key)?.stack ?? '';

  const style: Record<string, string> = {
    backgroundColor: 'var(--color-background)',
    color: 'var(--color-foreground)',
    fontFamily: 'var(--font-body)',
  };
  for (const key of COLOR_TOKEN_KEYS) style[`--color-${key}`] = colors[key] ?? '';
  for (const slot of FONT_SLOTS) {
    const stack = stackFor(fonts[slot]);
    if (stack) style[`--font-${slot}`] = stack;
  }
  for (const key of FONT_SIZE_KEYS) style[`--font-size-${key}`] = fontSizes[key] ?? '';

  return (
    <div className="space-y-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">{t('admin.appearance.preview.title')}</h2>
        <div className="flex overflow-hidden rounded-md border border-border text-xs">
          {(['light', 'dark'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onToggleMode(m)}
              className={`px-sm py-xs ${mode === m ? 'bg-primary text-primary-text' : 'text-muted hover:text-foreground'}`}
              aria-pressed={mode === m}
            >
              {t(`admin.appearance.preview.${m}`)}
            </button>
          ))}
        </div>
      </div>
      <div
        style={style as CSSProperties}
        className="overflow-hidden rounded-lg border border-border-strong p-md"
        data-reading-theme-preview={scopeId}
      >
        <ProsePreviewSample />
      </div>
    </div>
  );
}
```

**Step 3: Write `ReadingThemeForm.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { UserAppearanceView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useTranslation } from '@/i18n/client';
import { ColorTokenGrid, FontSlotEditors, FontSizeEditors } from '@/components/appearance/TokenEditors';
import { ReadingThemePreview } from '@/components/appearance/ReadingThemePreview';

export function ReadingThemeForm({ initial }: { initial: UserAppearanceView }) {
  const { t } = useTranslation();
  const [lightColors, setLight] = useState({ ...initial.lightColors });
  const [darkColors, setDark] = useState({ ...initial.darkColors });
  const [fonts, setFonts] = useState({ ...initial.fonts });
  const [fontSizes, setFontSizes] = useState({ ...initial.fontSizes });
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/user/appearance', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lightColors, darkColors, fonts, fontSizes }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.message ?? t('userCenter.readingTheme.error.generic'));
        return;
      }
      setSaved(true);
    } catch {
      setError(t('userCenter.readingTheme.error.generic'));
    } finally {
      setSaving(false);
    }
  }

  async function onReset() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/user/appearance', { method: 'DELETE' });
      if (!response.ok) {
        setError(t('userCenter.readingTheme.error.generic'));
        return;
      }
      const data: UserAppearanceView = await response.json();
      setLight({ ...data.lightColors });
      setDark({ ...data.darkColors });
      setFonts({ ...data.fonts });
      setFontSizes({ ...data.fontSizes });
      setSaved(true);
    } catch {
      setError(t('userCenter.readingTheme.error.generic'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
      <div className="space-y-lg">
        <ColorTokenGrid
          title={t('userCenter.readingTheme.light')}
          colors={lightColors}
          tokenKeys={initial.tokenKeys}
          onChange={setLight}
          labelFor={(k) => k}
        />
        <ColorTokenGrid
          title={t('userCenter.readingTheme.dark')}
          colors={darkColors}
          tokenKeys={initial.tokenKeys}
          onChange={setDark}
          labelFor={(k) => k}
        />
        <section className="space-y-sm">
          <h2 className="font-display text-lg font-semibold">{t('userCenter.readingTheme.fonts')}</h2>
          <FontSlotEditors fonts={fonts} catalog={initial.fontCatalog} onChange={setFonts} />
        </section>
        <section className="space-y-sm">
          <h2 className="font-display text-lg font-semibold">{t('userCenter.readingTheme.sizes')}</h2>
          <FontSizeEditors sizes={fontSizes} onChange={setFontSizes} />
        </section>

        {error && <Alert>{error}</Alert>}
        {saved && (
          <div className="rounded-md bg-primary/10 p-md text-sm text-primary" role="status">
            {t('userCenter.readingTheme.saved')}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-sm">
          <Button onClick={onSave} disabled={saving}>
            {saving ? t('userCenter.readingTheme.saving') : t('userCenter.readingTheme.save')}
          </Button>
          {initial.isCustomized && (
            <Button variant="ghost" onClick={onReset} disabled={saving}>
              {t('userCenter.readingTheme.reset')}
            </Button>
          )}
        </div>
      </div>

      <div className="lg:sticky lg:top-md lg:self-start">
        <ReadingThemePreview
          lightColors={lightColors}
          darkColors={darkColors}
          fonts={fonts}
          fontSizes={fontSizes}
          mode={mode}
          onToggleMode={setMode}
          fontCatalog={initial.fontCatalog}
        />
      </div>
    </div>
  );
}
```

**Step 4: Update the user page**

`apps/web/app/(user)/user-center/reading-theme/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { ReadingThemeForm } from '@/components/user-center/ReadingThemeForm';
import { getCurrentActor } from '@/server/services/auth';
import { getUserAppearance } from '@/server/services/user-appearance';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function ReadingThemePage() {
  const actor = await getCurrentActor();
  if (actor.kind === 'anonymous') redirect('/auth/login');

  const initial = await getUserAppearance({ actor });
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <div className="space-y-md">
      <div>
        <h1 className="font-display text-xl font-semibold">{t('userCenter.readingTheme.title')}</h1>
        <p className="mt-xs text-sm text-muted">{t('userCenter.readingTheme.description')}</p>
      </div>
      <ReadingThemeForm initial={initial} />
    </div>
  );
}
```

**Step 5: Delete the obsolete user-facing components**

```bash
rm apps/web/src/components/appearance/MarkdownThemePreview.tsx
rm apps/web/src/components/user-center/MarkdownThemesManager.tsx
```

**Step 6: Typecheck + commit**

```bash
pnpm --filter @next-wiki/web typecheck
git add -A
git commit -m "feat(user): replace markdown-theme manager with reading-theme token form"
```

---

## Task 11: i18n — update en.ts and zh.ts for the swapped panels

**Files:**
- Modify: `apps/web/src/i18n/locales/en.ts` — replace `admin.appearance.colors/fonts/sizes` keys with `admin.appearance.css` keys; replace `userCenter.readingTheme.*` keys with the token-form keys
- Modify: `apps/web/src/i18n/locales/zh.ts` — same shape, Chinese translations

**Step 1: Update `en.ts`**

Replace lines 227-256 (`admin.appearance.*`) with:

```ts
  'admin.appearance.title': 'Appearance',
  'admin.appearance.description':
    'Write free-form CSS to customize the app shell (header, sidebar, layout, decorations). Reading content uses your personal theme.',
  'admin.appearance.css.label': 'System theme stylesheet',
  'admin.appearance.css.hint':
    'CSS is applied to the app shell (outside Markdown content). Colors and fonts inside reading content are controlled by each user in their Reading theme. Maximum 50 KB. Layout, typography, borders, shadows, and animations are allowed.',
  'admin.appearance.css.reset': 'Clear',
  'admin.appearance.save': 'Save changes',
  'admin.appearance.saving': 'Saving...',
  'admin.appearance.saved': 'System theme updated.',
  'admin.appearance.error.generic': 'Could not save system theme. Check your CSS and try again.',
  'admin.appearance.preview.title': 'Live preview',
  'admin.appearance.preview.light': 'Light',
  'admin.appearance.preview.dark': 'Dark',
  'admin.appearance.preview.heading': 'Heading level 1',
  'admin.appearance.preview.subheading': 'Heading level 2',
  'admin.appearance.preview.h3': 'Heading level 3',
  'admin.appearance.preview.body': 'Body text shows how paragraphs read with the chosen font and size. Here is a',
  'admin.appearance.preview.link': 'sample link',
  'admin.appearance.preview.quote': 'Blockquotes use the muted color and a left accent border.',
  'admin.appearance.preview.listItem': 'A list item to show spacing and bullets.',
  'admin.appearance.preview.listItemAlt': 'A second item for rhythm.',
  'admin.appearance.preview.table.token': 'Token',
  'admin.appearance.preview.table.value': 'Value',
  'admin.appearance.preview.button': 'Primary button',
  'admin.appearance.tabs.system': 'System theme',
  'admin.appearance.tabs.site': 'Site info',
```

Replace lines 500-518 (`userCenter.readingTheme.*`) with:

```ts
  'userCenter.nav.readingTheme': 'Reading theme',
  'userCenter.readingTheme.title': 'Reading theme',
  'userCenter.readingTheme.description':
    'Choose the colors, fonts, and sizes used when you read Markdown content. Changes apply inside the reader (the rest of the site keeps the admin system theme).',
  'userCenter.readingTheme.light': 'Light mode colors',
  'userCenter.readingTheme.dark': 'Dark mode colors',
  'userCenter.readingTheme.fonts': 'Fonts',
  'userCenter.readingTheme.sizes': 'Font sizes',
  'userCenter.readingTheme.save': 'Save changes',
  'userCenter.readingTheme.saving': 'Saving...',
  'userCenter.readingTheme.saved': 'Reading theme updated.',
  'userCenter.readingTheme.reset': 'Reset to default',
  'userCenter.readingTheme.customized': 'Custom',
  'userCenter.readingTheme.default': 'Default',
  'userCenter.readingTheme.error.generic': 'Could not save reading theme. Check your values and try again.',
```

**Step 2: Update `zh.ts`**

Replace lines 227-256 with:

```ts
  'admin.appearance.title': '外观',
  'admin.appearance.description':
    '通过自定义 CSS 调整应用界面（顶部、侧边栏、布局与装饰）。阅读内容的样式由每位用户在「阅读主题」中自行设置。',
  'admin.appearance.css.label': '系统主题样式表',
  'admin.appearance.css.hint':
    'CSS 仅作用于应用界面（不作用于 Markdown 阅读内容）。阅读内容中的颜色与字体由用户在「阅读主题」中设置。最大 50 KB。允许使用布局、字体、边框、阴影与动画。',
  'admin.appearance.css.reset': '清空',
  'admin.appearance.save': '保存修改',
  'admin.appearance.saving': '保存中...',
  'admin.appearance.saved': '系统主题已更新。',
  'admin.appearance.error.generic': '无法保存系统主题，请检查 CSS 后重试。',
  'admin.appearance.preview.title': '实时预览',
  'admin.appearance.preview.light': '浅色',
  'admin.appearance.preview.dark': '深色',
  'admin.appearance.preview.heading': '一级标题',
  'admin.appearance.preview.subheading': '二级标题',
  'admin.appearance.preview.h3': '三级标题',
  'admin.appearance.preview.body': '正文展示所选字体与字号下段落的阅读效果。这里有一个',
  'admin.appearance.preview.link': '示例链接',
  'admin.appearance.preview.quote': '引用块使用弱化色与左侧强调边框。',
  'admin.appearance.preview.listItem': '列表项,用于展示间距与项目符号。',
  'admin.appearance.preview.listItemAlt': '第二个列表项,用于观察节奏。',
  'admin.appearance.preview.table.token': '名称',
  'admin.appearance.preview.table.value': '取值',
  'admin.appearance.preview.button': '主按钮',
  'admin.appearance.tabs.system': '系统主题',
  'admin.appearance.tabs.site': '站点信息',
```

Replace lines 481-499 with:

```ts
  'userCenter.nav.readingTheme': '阅读主题',
  'userCenter.readingTheme.title': '阅读主题',
  'userCenter.readingTheme.description':
    '选择阅读 Markdown 内容时使用的颜色、字体与字号。修改仅作用于阅读器（站点其他部分仍使用管理员设置的系统主题）。',
  'userCenter.readingTheme.light': '浅色模式配色',
  'userCenter.readingTheme.dark': '深色模式配色',
  'userCenter.readingTheme.fonts': '字体',
  'userCenter.readingTheme.sizes': '字号',
  'userCenter.readingTheme.save': '保存修改',
  'userCenter.readingTheme.saving': '保存中...',
  'userCenter.readingTheme.saved': '阅读主题已更新。',
  'userCenter.readingTheme.reset': '恢复默认',
  'userCenter.readingTheme.customized': '自定义',
  'userCenter.readingTheme.default': '默认',
  'userCenter.readingTheme.error.generic': '无法保存阅读主题，请检查取值后重试。',
```

**Step 3: Verify i18n parity**

```bash
pnpm --filter @next-wiki/web typecheck
grep -n "admin.appearance\." apps/web/src/i18n/locales/en.ts | head -20
grep -n "userCenter.readingTheme\." apps/web/src/i18n/locales/en.ts | head -20
```

Confirm the new keys are present and the deleted ones (`admin.appearance.colors.light`, `admin.appearance.fonts.title`, `userCenter.readingTheme.cssLabel`, etc.) are gone.

**Step 4: Commit**

```bash
git add apps/web/src/i18n/locales/
git commit -m "chore(i18n): update en/zh strings for swapped theme panels"
```

---

## Task 12: Tests — add new, drop obsolete, regenerate OpenAPI, final verification

**Files:**
- Create: `apps/web/e2e/system-theme.spec.ts` (renamed/replacement for `appearance-settings.spec.ts`)
- Create: `apps/web/e2e/reading-theme.spec.ts` (renamed/replacement for `markdown-themes.spec.ts`)
- Delete: `apps/web/e2e/appearance-settings.spec.ts`
- Delete: `apps/web/e2e/markdown-themes.spec.ts`
- Regenerate: `apps/web/public/openapi.json`

**Step 1: Write `system-theme.spec.ts`**

```ts
import { test, expect, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
}

test.describe('admin system theme', () => {
  test('admin writes CSS and it is injected on the next page', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/appearance');

    await expect(page.getByRole('heading', { name: 'Appearance', level: 1 })).toBeVisible();

    const textarea = page.getByLabel('System theme stylesheet');
    await textarea.fill('.header { display: flex; gap: 1rem; }');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('System theme updated.')).toBeVisible();

    await page.goto('/');
    const css = await page.locator('#app-system-theme').innerText();
    expect(css).toContain('display: flex');
  });

  test('color declarations are stripped on save', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/appearance');

    await page.getByLabel('System theme stylesheet').fill('.x { color: red; background: blue; padding: 1rem; }');
    await page.getByRole('button', { name: 'Save changes' }).click();

    // The form's local state still shows the input (textarea is uncontrolled
    // for the save response), so check the next page's injected CSS.
    await page.goto('/');
    const css = await page.locator('#app-system-theme').innerText();
    expect(css).not.toContain('color');
    expect(css).not.toContain('background');
    expect(css).toContain('padding: 1rem');
  });
});
```

**Step 2: Write `reading-theme.spec.ts`**

```ts
import { test, expect, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
}

test.describe('user reading theme', () => {
  test('user changes the light-mode primary color and it applies inside .prose', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/user-center/reading-theme');

    await expect(page.getByRole('heading', { name: 'Reading theme', level: 1 })).toBeVisible();

    // Update the light-mode primary color via the API directly to avoid UI flakiness.
    const response = await page.request.put('/api/user/appearance', {
      data: {
        lightColors: { primary: '#0ea5e9', 'primary-text': '#ffffff', 'primary-hover': '#0284c7',
          background: '#fafaf9', surface: '#ffffff', 'surface-elevated': '#f5f5f4',
          border: '#e7e5e4', 'border-strong': '#d6d3d1', muted: '#78716c', foreground: '#292524',
          ring: 'rgba(14, 165, 233, 0.25)', danger: '#dc2626', warning: '#d97706' },
        darkColors: { primary: '#f59e0b', 'primary-text': '#1c1917', 'primary-hover': '#d97706',
          background: '#1c1917', surface: '#292524', 'surface-elevated': '#44403c',
          border: '#57534e', 'border-strong': '#78716c', muted: '#a8a29e', foreground: '#f5f5f4',
          ring: 'rgba(245, 158, 11, 0.25)', danger: '#f87171', warning: '#fbbf24' },
        fonts: { body: 'source-sans-3', display: 'crimson-pro', mono: 'system-mono' },
        fontSizes: { base: '1rem', h1: '2.25rem', h2: '1.75rem', h3: '1.375rem' },
      },
    });
    expect(response.ok()).toBe(true);

    // Visit a page with prose content (any published page will do — pick the home).
    await page.goto('/');
    const css = await page.locator('#app-reading-theme').innerText();
    expect(css).toContain('--color-primary:#0ea5e9');
  });

  test('reset returns defaults', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const put = await page.request.put('/api/user/appearance', {
      data: {
        lightColors: { primary: '#0ea5e9', 'primary-text': '#ffffff', 'primary-hover': '#0284c7',
          background: '#fafaf9', surface: '#ffffff', 'surface-elevated': '#f5f5f4',
          border: '#e7e5e4', 'border-strong': '#d6d3d1', muted: '#78716c', foreground: '#292524',
          ring: 'rgba(14, 165, 233, 0.25)', danger: '#dc2626', warning: '#d97706' },
        darkColors: { primary: '#f59e0b', 'primary-text': '#1c1917', 'primary-hover': '#d97706',
          background: '#1c1917', surface: '#292524', 'surface-elevated': '#44403c',
          border: '#57534e', 'border-strong': '#78716c', muted: '#a8a29e', foreground: '#f5f5f4',
          ring: 'rgba(245, 158, 11, 0.25)', danger: '#f87171', warning: '#fbbf24' },
        fonts: { body: 'source-sans-3', display: 'crimson-pro', mono: 'system-mono' },
        fontSizes: { base: '1rem', h1: '2.25rem', h2: '1.75rem', h3: '1.375rem' },
      },
    });
    expect(put.ok()).toBe(true);

    const del = await page.request.delete('/api/user/appearance');
    expect(del.ok()).toBe(true);
    const body = await del.json();
    expect(body.isCustomized).toBe(false);

    await page.goto('/');
    const css = await page.locator('#app-reading-theme').count();
    expect(css).toBe(0); // no <style id="app-reading-theme"> when no row
  });
});
```

**Step 3: Delete the obsolete e2e specs**

```bash
rm apps/web/e2e/appearance-settings.spec.ts
rm apps/web/e2e/markdown-themes.spec.ts
```

**Step 4: Regenerate OpenAPI**

```bash
pnpm --filter @next-wiki/web openapi:generate
```

Expected: `apps/web/public/openapi.json` updated with the new `/api/user/appearance` route, updated `/api/settings/appearance` schema, and removed `/api/markdown-themes*` routes.

```bash
git diff apps/web/public/openapi.json
git add apps/web/public/openapi.json
git commit -m "docs(api): regenerate openapi for inverted theme ownership"
```

**Step 5: Run the full test suite**

```bash
docker compose up -d --build
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web lint
pnpm --filter @next-wiki/web test
pnpm --filter @next-wiki/web test:e2e
```

Expected: all green.

**Step 6: Commit (if any cleanup needed)**

```bash
git add -A
git commit -m "test(theme): add e2e coverage for swapped theme panels"
```

---

## Out of scope

- Renaming `/api/settings/appearance` to `/api/settings/system-theme` (path kept for stability).
- Built-in reading themes (the new defaults live in code, not in the database).
- Migrating existing user CSS themes into tokens (clean break by user decision).
- Per-page reading theme overrides (single per-user set covers all `.prose`).
- A/B testing or staged rollout (the swap is atomic per deploy).
