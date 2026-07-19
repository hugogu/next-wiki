import { test, expect, type Page } from '@playwright/test';
import { clickSignInSubmit } from './test-helpers';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function register(page: Page, email: string, password: string) {
  await page.goto('/auth/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('/');
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await clickSignInSubmit(page);
  await page.waitForURL('/');
}

async function createApiKey(page: Page, name: string, scopes: string[]): Promise<string> {
  await page.goto('/user-center/api-keys');
  await page.getByRole('button', { name: 'Create API key' }).first().click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  for (const scope of scopes) {
    await page.getByRole('checkbox', { name: scope }).check();
  }
  await page.locator('form').getByRole('button', { name: 'Create API key' }).click();

  const code = page.locator('code').filter({ hasText: /^nwk_/ });
  await expect(code).toBeVisible();
  const secret = (await code.textContent())?.trim();
  if (!secret) throw new Error('API key secret not found');

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(code).not.toBeVisible();
  return secret;
}

test.describe('admin audit', () => {
  test('admin can view and filter all audit entries; non-admin gets 404', async ({ page }) => {
    const timestamp = Date.now();
    const userEmail = `admin-audit-${timestamp}@example.com`;
    const password = 'Password123!';

    await register(page, userEmail, password);
    const viewKey = await createApiKey(page, 'Audit View', ['View']);

    // Generate audited API key requests.
    const successResponse = await page.request.get('/api/v1/pages', {
      headers: { Authorization: `Bearer ${viewKey}` },
    });
    expect(successResponse.status()).toBe(200);
    const errorResponse = await page.request.post('/api/v1/pages', {
      headers: { Authorization: `Bearer ${viewKey}` },
      data: { path: `admin-audit-${timestamp}`, title: 'T', contentSource: 'c' },
    });
    expect(errorResponse.status()).toBe(403);

    // Capture the user's id from their own audit log.
    const ownAudit = await page.request.get('/api/audit');
    expect(ownAudit.status()).toBe(200);
    const ownBody = await ownAudit.json();
    expect(ownBody.entries.length).toBeGreaterThan(0);
    const userId = ownBody.entries[0].userId;
    expect(userId).toBeTruthy();

    // Navigate to admin audit page as admin.
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/api-audit');
    await expect(page.locator('input[placeholder="All users"]')).toBeVisible();
    await expect(page.locator('text=' + userEmail).first()).toBeVisible();

    // Filter by user id.
    await page.locator('input[placeholder="All users"]').fill(userId);
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.locator('text=' + userEmail).first()).toBeVisible();

    // Filter by error status should show the failed POST but hide the successful GET.
    await page.locator('input[placeholder="All users"]').clear();
    await page.getByLabel('Status', { exact: true }).selectOption('Error');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.locator('text=' + userEmail).first()).toBeVisible();
    await expect(page.locator('text=GET /api/v1/pages').first()).not.toBeVisible();

    // Non-admin is rejected with 404 (no existence leak).
    const readerContext = await page.context().browser()?.newContext();
    if (!readerContext) throw new Error('Could not create reader context');
    const readerPage = await readerContext.newPage();
    await register(readerPage, `reader-audit-${timestamp}@example.com`, password);
    await readerPage.goto('/admin/api-audit');
    await expect(readerPage.locator('h1:has-text("404")')).toBeVisible();
    await readerContext.close();
  });
});
