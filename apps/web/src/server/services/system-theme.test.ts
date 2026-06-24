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
  const { userId } = await authService.register({
    email: `st-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'Password123!',
  });
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
    expect(view.templates.length).toBeGreaterThanOrEqual(2);
    expect(view.templates.find((t) => t.name === 'Default')).toBeDefined();
    expect(view.templates.find((t) => t.name === 'Wiki.js-inspired')).toBeDefined();
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
    const big = 'h1{font-size:1rem;}'.repeat(6000);
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
    const { userId } = await authService.register({
      email: `st-r-${Date.now()}@example.com`,
      password: 'Password123!',
    });
    const ctx = buildUserCtx(userId, 'reader');
    await expect(updateSystemThemeCss(ctx, { css: '.x { padding: 1rem; }' })).rejects.toThrow(
      DomainError,
    );
  });
});
