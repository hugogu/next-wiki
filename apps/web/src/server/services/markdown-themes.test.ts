import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as authService from '@/server/services/auth';
import { buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { DEFAULT_THEME_ID, WIKIJS_THEME_ID } from '@/server/appearance/builtin-themes';
import {
  activateTheme,
  createTheme,
  deleteTheme,
  getActiveThemeCss,
  getTheme,
  listThemes,
  seedBuiltinThemes,
  updateTheme,
} from '@/server/services/markdown-themes';

async function createUser(role: 'admin' | 'editor' | 'reader' = 'reader') {
  const { userId } = await authService.register({ email: `mdtheme-${Math.random().toString(36).slice(2)}@example.com`, password: 'Password123!' });
  if (role !== 'reader') await db.update(schema.users).set({ role }).where(eq(schema.users.id, userId));
  return buildUserCtx(userId, role);
}

describe('markdown-themes service', () => {
  beforeAll(async () => {
    await db.delete(schema.markdownThemes);
    await db.delete(schema.sessions);
    await db.delete(schema.users);
    await seedBuiltinThemes();
  });

  afterAll(async () => {
    await closeDb();
  });

  it('lists the two built-ins and exposes their CSS', async () => {
    const ctx = await createUser();
    const list = await listThemes(ctx);
    const builtins = list.themes.filter((t) => t.isBuiltin);
    expect(builtins.length).toBeGreaterThanOrEqual(2);
    expect(builtins.some((t) => t.name === 'Default')).toBe(true);
    expect(builtins.some((t) => t.name === 'Wiki.js-inspired')).toBe(true);

    const view = await getTheme(ctx, WIKIJS_THEME_ID);
    expect(view.css).toContain('font-size');
    expect(view.isBuiltin).toBe(true);
  });

  it('forbids editing a built-in (offers copy instead)', async () => {
    const ctx = await createUser();
    await expect(updateTheme(ctx, WIKIJS_THEME_ID, { css: 'h1{font-size:1rem;}' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('copies, edits, renames, and sanitizes a personal theme', async () => {
    const ctx = await createUser();
    const created = await createTheme(ctx, { sourceThemeId: WIKIJS_THEME_ID, name: 'My Theme' });
    expect(created.owned).toBe(true);
    expect(created.isBuiltin).toBe(false);

    const updated = await updateTheme(ctx, created.id, { name: 'Renamed', css: 'h1 { color: red; font-size: 3rem; }' });
    expect(updated.name).toBe('Renamed');
    expect(updated.css).toContain('font-size: 3rem');
    expect(updated.css).not.toContain('color'); // sanitized away
  });

  it('rejects a duplicate personal name', async () => {
    const ctx = await createUser();
    await createTheme(ctx, { sourceThemeId: DEFAULT_THEME_ID, name: 'Dup' });
    await expect(createTheme(ctx, { sourceThemeId: DEFAULT_THEME_ID, name: 'Dup' })).rejects.toThrow(DomainError);
  });

  it('activates a theme and resolves its CSS; isolates between users', async () => {
    const a = await createUser();
    const b = await createUser();
    const theme = await createTheme(a, { sourceThemeId: WIKIJS_THEME_ID, name: 'A Theme' });
    await activateTheme(a, { themeId: theme.id });

    const aId = (a.actor as { userId: string }).userId;
    expect(await getActiveThemeCss(aId)).toContain('font-size');
    // user b unaffected → Default css
    const bList = await listThemes(b);
    expect(bList.activeThemeId).toBeNull();
  });

  it('deleting the active theme falls back to Default', async () => {
    const ctx = await createUser();
    const theme = await createTheme(ctx, { sourceThemeId: WIKIJS_THEME_ID, name: 'Temp' });
    await activateTheme(ctx, { themeId: theme.id });
    await deleteTheme(ctx, theme.id);
    const list = await listThemes(ctx);
    expect(list.activeThemeId).toBeNull();
  });

  it('activating the Default built-in stores null (no override)', async () => {
    const ctx = await createUser();
    const result = await activateTheme(ctx, { themeId: DEFAULT_THEME_ID });
    expect(result.activeThemeId).toBeNull();
  });
});
