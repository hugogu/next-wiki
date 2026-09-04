import { test, expect, type Page } from '@playwright/test';

async function register(page: Page, email: string, password: string) {
  await page.goto('/auth/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('/');
}

async function loginAsAdmin(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('admin123');
  await page.locator('form').getByRole('button', { name: /sign in/i }).click();
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
  test('shows the scoped AI image capability in API-key creation', async ({ page }) => {
    const timestamp = Date.now();
    await register(page, `api-image-scope-${timestamp}@example.com`, 'Password123!');
    await page.goto('/user-center/api-keys');
    await page.getByRole('button', { name: 'Create API key' }).first().click();

    await expect(page.getByRole('checkbox', { name: 'AI image generation' })).toBeVisible();
  });

  test('keeps ordinary scopes when the memory provider preset is toggled', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/user-center/api-keys');
    await page.getByRole('button', { name: 'Create API key' }).first().click();

    const memoryProvider = page.locator('label').filter({ hasText: 'Memory provider' }).locator('input[type="checkbox"]');
    const viewScope = page.getByRole('checkbox', { name: /^View/ });
    await memoryProvider.check();
    await viewScope.check();
    await memoryProvider.uncheck();

    await expect(viewScope).toBeChecked();
    await expect(page.getByRole('checkbox', { name: /^Memory recall/ })).not.toBeChecked();
    await page.getByRole('button', { name: /cancel/i }).click();
  });

  test('attachments scope is preserved and shown after creation', async ({ page }) => {
    const timestamp = Date.now();
    await register(page, `api-attachments-scope-${timestamp}@example.com`, 'Password123!');
    await createApiKey(page, 'Attachments Key', ['View', 'Attachments']);

    await page.goto('/user-center/api-keys');
    const row = page.locator('tr', { hasText: 'Attachments Key' });
    await expect(row.getByText('Attachments', { exact: true })).toBeVisible();
  });

  test('allows an active key to update its scopes without rotating the secret', async ({ page }) => {
    const timestamp = Date.now();
    await register(page, `api-key-edit-${timestamp}@example.com`, 'Password123!');
    const secret = await createApiKey(page, 'Editable permissions', ['View']);

    await page.goto('/user-center/api-keys');
    const row = page.locator('tr', { hasText: 'Editable permissions' });
    const prefix = await row.locator('td').nth(3).textContent();
    await row.getByRole('button', { name: 'Edit permissions' }).click();
    await page.getByRole('checkbox', { name: /^Create/ }).check();
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(row.getByText('Create', { exact: true })).toBeVisible();
    await expect(row.locator('td').nth(3)).toHaveText(prefix!.trim());
    const listResponse = await page.request.get('/api/v1/pages', {
      headers: { Authorization: `Bearer ${secret}` },
    });
    expect(listResponse.status()).toBe(200);
  });

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
