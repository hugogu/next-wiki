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

async function register(page: Page, email: string, password: string) {
  await page.goto('/auth/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('/');
}

test.describe('admin analytics settings', () => {
  test.beforeEach(async ({ page }) => {
    await blockAnalyticsVendorRequests(page);
  });

  test.afterEach(async ({ page }) => {
    await page.request.put('/api/settings/analytics', {
      data: { providers: [{ provider: 'baidu_tongji', enabled: false, trackingId: VALID_BAIDU_ID }] },
    });
  });

  test('admin configures a provider and applies', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/analytics');

    await expect(page.getByRole('heading', { name: 'Web analytics', level: 1 })).toBeVisible();

    // Not `exact: true`: the label's accessible name also carries the format
    // hint text after the input ("Tracking ID 32-character hex string"), so
    // an exact match against "Tracking ID" alone never resolves.
    await page.getByLabel('Tracking ID').fill(VALID_BAIDU_ID);
    await page.getByRole('switch', { name: /Baidu Tongji/i }).click();
    await page.getByRole('button', { name: 'Apply' }).click();

    await expect(page.getByText('Analytics settings applied.')).toBeVisible();
    await expect(page.getByRole('switch', { name: /Baidu Tongji/i })).toHaveAttribute('aria-checked', 'true');
  });

  test('non-admin gets 404', async ({ page }) => {
    const timestamp = Date.now();
    await register(page, `reader-analytics-${timestamp}@example.com`, 'Password123!');
    await page.goto('/admin/analytics');
    await expect(page.locator('h1:has-text("404")')).toBeVisible();
  });
});
