import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as authService from '@/server/services/auth';
import { buildUserCtx, isDemoReadOnly, setDemoReadOnlyCache } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { getDemoModeView, loadDemoReadOnlyFromDb, setDemoReadOnlyMode } from '@/server/services/demo-mode';

async function createAdmin() {
  const { userId } = await authService.register({ email: `demo-admin-${Date.now()}@example.com`, password: 'Password123!' });
  await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, userId));
  return buildUserCtx(userId, 'admin');
}

describe('demo-mode service', () => {
  beforeAll(async () => {
    await db.delete(schema.siteSettings);
    await db.delete(schema.sessions);
    await db.delete(schema.users);
  });

  afterEach(() => {
    setDemoReadOnlyCache(false);
  });

  afterAll(async () => {
    await closeDb();
  });

  it('bootstraps the row from NEXT_WIKI_DEMO_READONLY when none exists yet', async () => {
    await db.delete(schema.siteSettings);
    const original = process.env.NEXT_WIKI_DEMO_READONLY;
    process.env.NEXT_WIKI_DEMO_READONLY = 'true';
    try {
      await loadDemoReadOnlyFromDb();
    } finally {
      if (original === undefined) delete process.env.NEXT_WIKI_DEMO_READONLY;
      else process.env.NEXT_WIKI_DEMO_READONLY = original;
    }
    expect(isDemoReadOnly()).toBe(true);
    const row = await db.query.siteSettings.findFirst({ where: eq(schema.siteSettings.id, 'default') });
    expect(row?.demoReadonly).toBe(true);
  });

  it('once a row exists, ignores the env var and only trusts the DB value', async () => {
    const ctx = await createAdmin();
    await setDemoReadOnlyMode(ctx, false);

    const original = process.env.NEXT_WIKI_DEMO_READONLY;
    process.env.NEXT_WIKI_DEMO_READONLY = 'true';
    try {
      await loadDemoReadOnlyFromDb();
    } finally {
      if (original === undefined) delete process.env.NEXT_WIKI_DEMO_READONLY;
      else process.env.NEXT_WIKI_DEMO_READONLY = original;
    }
    // The env var says true, but the persisted row says false — DB wins.
    expect(isDemoReadOnly()).toBe(false);
  });

  it('lets an admin toggle the mode and persists it', async () => {
    const ctx = await createAdmin();
    expect(await setDemoReadOnlyMode(ctx, true)).toBe(true);
    expect(isDemoReadOnly()).toBe(true);
    expect((await getDemoModeView(ctx)).enabled).toBe(true);

    expect(await setDemoReadOnlyMode(ctx, false)).toBe(false);
    expect(isDemoReadOnly()).toBe(false);
  });

  it('rejects a non-admin, and rejects entirely while demo-readonly is on for actions other than the toggle itself', async () => {
    const { userId } = await authService.register({ email: `demo-editor-${Date.now()}@example.com`, password: 'Password123!' });
    const editorCtx = buildUserCtx(userId, 'editor');
    await expect(setDemoReadOnlyMode(editorCtx, true)).rejects.toThrow(DomainError);
    await expect(getDemoModeView(editorCtx)).rejects.toThrow(DomainError);
  });

  it('an admin can always turn the mode back off, even while it is active', async () => {
    const ctx = await createAdmin();
    await setDemoReadOnlyMode(ctx, true);
    expect(isDemoReadOnly()).toBe(true);
    // Toggling off must not itself be blocked by the mode it is turning off.
    expect(await setDemoReadOnlyMode(ctx, false)).toBe(false);
    expect(isDemoReadOnly()).toBe(false);
  });
});
