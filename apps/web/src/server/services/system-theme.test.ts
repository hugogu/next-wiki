import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as authService from '@/server/services/auth';
import { buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { DEFAULT_THEME_ID, WIKIJS_THEME_ID } from '@/server/appearance/builtin-themes';
import {
  activateSystemTheme,
  createSystemTheme,
  deleteSystemTheme,
  getActiveThemeCss,
  getSystemTheme,
  listSystemThemes,
  seedBuiltinSystemThemes,
  updateSystemTheme,
} from '@/server/services/system-theme';

async function createAdmin() {
  const { userId } = await authService.register({
    email: `st-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'Password123!',
  });
  await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, userId));
  return buildUserCtx(userId, 'admin');
}

async function createReader() {
  const { userId } = await authService.register({
    email: `st-r-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'Password123!',
  });
  return buildUserCtx(userId, 'reader');
}

describe('system-theme service', () => {
  beforeAll(async () => {
    await db.delete(schema.systemThemeSettings);
    await db.delete(schema.systemThemes);
    await db.delete(schema.sessions);
    await db.delete(schema.users);
    await seedBuiltinSystemThemes();
  });

  afterAll(async () => {
    await closeDb();
  });

  it('lists the two built-ins and exposes their CSS', async () => {
    const ctx = await createAdmin();
    const list = await listSystemThemes(ctx);
    const builtins = list.themes.filter((t) => t.isBuiltin);
    expect(builtins.length).toBeGreaterThanOrEqual(2);
    expect(builtins.some((t) => t.name === 'Default')).toBe(true);
    expect(builtins.some((t) => t.name === 'Wiki.js-inspired')).toBe(true);

    const view = await getSystemTheme(ctx, WIKIJS_THEME_ID);
    expect(view.css).toContain('font-size');
    expect(view.isBuiltin).toBe(true);
  });

  it('forbids editing a built-in (offers copy instead)', async () => {
    const ctx = await createAdmin();
    await expect(
      updateSystemTheme(ctx, WIKIJS_THEME_ID, { css: 'h1{font-size:1rem;}' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('copies, edits, renames, and sanitizes a custom theme', async () => {
    const ctx = await createAdmin();
    const created = await createSystemTheme(ctx, { sourceThemeId: WIKIJS_THEME_ID, name: 'My Theme' });
    expect(created.isBuiltin).toBe(false);

    const updated = await updateSystemTheme(ctx, created.id, {
      name: 'Renamed',
      css: 'h1 { color: red; font-size: 3rem; }',
    });
    expect(updated.name).toBe('Renamed');
    expect(updated.css).toContain('font-size: 3rem');
    expect(updated.css).not.toContain('color');
  });

  it('rejects a duplicate name', async () => {
    const ctx = await createAdmin();
    await createSystemTheme(ctx, { sourceThemeId: DEFAULT_THEME_ID, name: 'Dup' });
    await expect(
      createSystemTheme(ctx, { sourceThemeId: DEFAULT_THEME_ID, name: 'Dup' }),
    ).rejects.toThrow(DomainError);
  });

  it('activates a theme and resolves its CSS', async () => {
    const ctx = await createAdmin();
    const theme = await createSystemTheme(ctx, { sourceThemeId: WIKIJS_THEME_ID, name: 'A Theme' });
    const result = await activateSystemTheme(ctx, { themeId: theme.id });
    expect(result.activeThemeId).toBe(theme.id);

    const css = await getActiveThemeCss();
    expect(css).toContain('font-size');
  });

  it('activating the Default built-in stores null (no override)', async () => {
    const ctx = await createAdmin();
    const result = await activateSystemTheme(ctx, { themeId: DEFAULT_THEME_ID });
    expect(result.activeThemeId).toBeNull();
  });

  it('deleting the active theme falls back to null', async () => {
    const ctx = await createAdmin();
    const theme = await createSystemTheme(ctx, { sourceThemeId: WIKIJS_THEME_ID, name: 'Temp' });
    await activateSystemTheme(ctx, { themeId: theme.id });
    await deleteSystemTheme(ctx, theme.id);
    const list = await listSystemThemes(ctx);
    expect(list.activeThemeId).toBeNull();
    expect(await getActiveThemeCss()).toBe('');
  });

  it('rejects writes from a non-admin', async () => {
    const ctx = await createReader();
    await expect(listSystemThemes(ctx)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      createSystemTheme(ctx, { sourceThemeId: WIKIJS_THEME_ID, name: 'Nope' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
