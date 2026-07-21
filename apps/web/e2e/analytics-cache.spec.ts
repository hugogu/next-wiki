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

test.describe('analytics public delivery is static-compatible', () => {
  test.beforeEach(async ({ page }) => {
    await blockAnalyticsVendorRequests(page);
  });

  test.afterEach(async ({ page }) => {
    await setBaiduEnabled(page, false);
  });

  test('two anonymous requests for the same page return identical analytics script content, and a mutation is reflected on the next request', async ({
    page,
    request,
  }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await setBaiduEnabled(page, true);

    // Two anonymous (unauthenticated) requests to the same public page must
    // render the same analytics script — the document body depends only on
    // admin-configured state, never on session/cookie/header (P12).
    const first = await request.get('/');
    const second = await request.get('/');
    expect(first.ok()).toBe(true);
    expect(second.ok()).toBe(true);
    const firstBody = await first.text();
    const secondBody = await second.text();
    expect(firstBody).toContain(`hm.baidu.com/hm.js?${VALID_BAIDU_ID}`);
    expect(secondBody).toContain(`hm.baidu.com/hm.js?${VALID_BAIDU_ID}`);

    await setBaiduEnabled(page, false);

    const third = await request.get('/');
    expect(await third.text()).not.toContain('hm.baidu.com');
  });
});
