import { test, expect, type Page } from '@playwright/test';
import { blockAnalyticsVendorRequests, clickSignInSubmit } from './test-helpers';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';
const VALID_BAIDU_ID = 'abcdef0123456789abcdef0123456789';

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await clickSignInSubmit(page);
  await page.waitForURL('/');
}

async function setBaiduEnabled(page: Page, enabled: boolean) {
  const response = await page.request.put('/api/settings/analytics', {
    data: { providers: [{ provider: 'baidu_tongji', enabled, trackingId: VALID_BAIDU_ID }] },
  });
  expect(response.ok()).toBe(true);
}

test.describe('analytics script injection', () => {
  test.beforeEach(async ({ page }) => {
    await blockAnalyticsVendorRequests(page);
  });

  test.afterEach(async ({ page }) => {
    await setBaiduEnabled(page, false);
  });

  test('the enabled provider script appears on public, reader, admin, and auth surfaces; disabling removes it everywhere', async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await setBaiduEnabled(page, true);

    const surfaces = ['/', '/welcome', '/admin/analytics', '/auth/login'];
    for (const surface of surfaces) {
      await page.goto(surface);
      const html = await page.content();
      expect(html, `expected ${surface} to include the Baidu Tongji loader`).toContain(
        `hm.baidu.com/hm.js?${VALID_BAIDU_ID}`,
      );
    }

    await setBaiduEnabled(page, false);

    for (const surface of surfaces) {
      await page.goto(surface);
      const html = await page.content();
      expect(html, `expected ${surface} to no longer include the Baidu Tongji loader`).not.toContain(
        'hm.baidu.com',
      );
    }
  });
});
