import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as authService from '@/server/services/auth';
import { buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import {
  DEFAULT_ICP_URL,
  DEFAULT_SITE_NAME,
  clearIcon,
  getIcon,
  getSiteView,
  setIcon,
  updateSiteSettings,
} from '@/server/services/site-settings';

async function createAdmin() {
  const { userId } = await authService.register({ email: `site-admin-${Date.now()}@example.com`, password: 'Password123!' });
  await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, userId));
  return buildUserCtx(userId, 'admin');
}

describe('site-settings service', () => {
  beforeAll(async () => {
    await db.delete(schema.siteSettings);
    await db.delete(schema.sessions);
    await db.delete(schema.users);
  });

  afterAll(async () => {
    await closeDb();
  });

  it('returns defaults when unset (default name, default icon, empty footer)', async () => {
    const view = await getSiteView();
    expect(view.siteName).toBe(DEFAULT_SITE_NAME);
    expect(view.hasCustomIcon).toBe(false);
    expect(view.iconUrl).toBe('/api/settings/site/icon');
    expect(view.footerCopyright).toBeNull();
    expect(view.icp.number).toBeNull();
  });

  it('persists name, footer, and ICP filing for an admin', async () => {
    const ctx = await createAdmin();
    const view = await updateSiteSettings(ctx, {
      siteName: 'My Wiki',
      footerCopyright: '© 2026 Example',
      icpNumber: '京ICP备12345678号',
      icpUrl: null,
      publicSecurityNumber: null,
      publicSecurityUrl: null,
    });
    expect(view.siteName).toBe('My Wiki');
    expect(view.footerCopyright).toBe('© 2026 Example');
    // URL falls back to the official registry when a number is present
    expect(view.icp.number).toBe('京ICP备12345678号');
    expect(view.icp.url).toBe(DEFAULT_ICP_URL);
    // empty public-security filing renders nothing
    expect(view.publicSecurity.number).toBeNull();
    expect(view.publicSecurity.url).toBeNull();
  });

  it('rejects writes from a non-admin', async () => {
    const { userId } = await authService.register({ email: `site-reader-${Date.now()}@example.com`, password: 'Password123!' });
    const ctx = buildUserCtx(userId, 'reader');
    await expect(
      updateSiteSettings(ctx, {
        siteName: 'Nope',
        footerCopyright: null,
        icpNumber: null,
        icpUrl: null,
        publicSecurityNumber: null,
        publicSecurityUrl: null,
      }),
    ).rejects.toThrow(DomainError);
  });

  it('stores and clears a custom icon', async () => {
    const ctx = await createAdmin();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
    await setIcon(ctx, svg, 'image/svg+xml');
    expect(await getIcon()).not.toBeNull();
    expect((await getSiteView()).hasCustomIcon).toBe(true);

    await clearIcon(ctx);
    expect(await getIcon()).toBeNull();
    expect((await getSiteView()).hasCustomIcon).toBe(false);
  });

  // Regression: the two icon columns are independently nullable, and getIcon()
  // requires both. The view must not advertise an icon the route falls back
  // away from — `iconMime` (which link-preview metadata reads) has to agree
  // with `hasCustomIcon`.
  it('reports no custom icon when the stored bytes have no MIME type', async () => {
    const ctx = await createAdmin();
    await setIcon(ctx, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml');
    await db
      .update(schema.siteSettings)
      .set({ iconMime: null })
      .where(eq(schema.siteSettings.id, 'default'));

    expect(await getIcon()).toBeNull();
    const view = await getSiteView();
    expect(view.hasCustomIcon).toBe(false);
    expect(view.iconMime).toBeNull();
  });

  it('exposes the icon MIME type alongside hasCustomIcon for a complete row', async () => {
    const ctx = await createAdmin();
    await setIcon(ctx, Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png');

    const view = await getSiteView();
    expect(view.hasCustomIcon).toBe(true);
    expect(view.iconMime).toBe('image/png');
  });

  it('rejects an unsupported icon mime type', async () => {
    const ctx = await createAdmin();
    await expect(setIcon(ctx, Buffer.from('x'), 'application/pdf')).rejects.toThrow(DomainError);
  });
});
