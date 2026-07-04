import { test, expect, type Page } from '@playwright/test';

async function register(page: Page, email: string, password: string) {
  await page.goto('/auth/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
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
  await expect(code).not.toBeVisible();
  return secret;
}

async function revokeApiKey(page: Page, name: string) {
  await page.goto('/user-center/api-keys');
  const row = page.locator('tr', { hasText: name });
  await row.getByRole('button', { name: 'Revoke' }).click();
  await page.getByRole('button', { name: 'Revoke' }).last().click();
  await expect(row.getByText('Revoked')).toBeVisible();
}

test.describe('api keys', () => {
  test('view scope key can read but not write; create scope as reader is role-denied; revocation blocks access and audit logs attempts', async ({ page }) => {
    const timestamp = Date.now();
    const email = `api-keys-${timestamp}@example.com`;
    const password = 'Password123!';
    await register(page, email, password);

    const viewKey = await createApiKey(page, 'View Only', ['View']);

    const listResponse = await page.request.get('/api/v1/pages', {
      headers: { Authorization: `Bearer ${viewKey}` },
    });
    expect(listResponse.status()).toBe(200);

    const createResponse = await page.request.post('/api/v1/pages', {
      headers: { Authorization: `Bearer ${viewKey}` },
      data: { path: `api-key-test-${timestamp}`, title: 'Test', contentSource: 'test' },
    });
    expect(createResponse.status()).toBe(403);

    const createKey = await createApiKey(page, 'Create as Reader', ['Create']);
    const readerCreateResponse = await page.request.post('/api/v1/pages', {
      headers: { Authorization: `Bearer ${createKey}` },
      data: { path: `api-key-test-reader-${timestamp}`, title: 'Test', contentSource: 'test' },
    });
    expect(readerCreateResponse.status()).toBe(403);

    await revokeApiKey(page, 'View Only');
    const revokedResponse = await page.request.get('/api/v1/pages', {
      headers: { Authorization: `Bearer ${viewKey}` },
    });
    expect(revokedResponse.status()).toBe(401);

    // Audit log shows the attempts.
    await page.goto('/user-center/audit');
    await expect(page.locator('tr', { hasText: 'GET' }).filter({ hasText: '/api/v1/pages' }).first()).toBeVisible();
    await expect(page.locator('tr', { hasText: 'POST' }).filter({ hasText: '/api/v1/pages' }).first()).toBeVisible();

    // Filter by error status.
    await page.getByLabel('Status', { exact: true }).selectOption('Error');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.locator('tr', { hasText: 'POST' }).filter({ hasText: '/api/v1/pages' }).first()).toBeVisible();
  });
});
