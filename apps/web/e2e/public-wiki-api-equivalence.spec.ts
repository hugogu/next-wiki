import { test, expect, type Page } from '@playwright/test';
import { revokeAllApiKeys } from './test-helpers';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
}

async function createApiKey(page: Page, name: string, scopes: string[]): Promise<string> {
  await page.goto('/user-center/api-keys');
  await page.getByRole('button', { name: 'Create API key' }).first().click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  for (const scope of scopes) {
    await page.getByRole('checkbox', { name: new RegExp(`^${scope}`) }).check();
  }
  await page.locator('form').getByRole('button', { name: 'Create API key' }).click();
  const code = page.locator('code').filter({ hasText: /^nwk_/ });
  await expect(code).toBeVisible();
  const secret = (await code.textContent())?.trim();
  if (!secret) throw new Error('API key secret not found');
  await page.getByRole('button', { name: 'Close' }).click();
  return secret;
}

test.describe('Public Wiki Content API permissions', () => {
  test.afterEach(async ({ page }) => {
    await revokeAllApiKeys(page);
  });

  test('view-only API key cannot create pages', async ({ page }) => {
    const timestamp = Date.now();
    await login(page);
    const viewKey = await createApiKey(page, `Public API Permission ${timestamp}`, ['View']);

    const publicCreate = await page.request.post('/api/v1/pages', {
      headers: { Authorization: `Bearer ${viewKey}` },
      data: { path: `public-denied-${timestamp}`, title: 'Denied', contentSource: 'Denied' },
    });

    expect(publicCreate.status()).toBe(403);
  });
});
