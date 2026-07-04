import { test, expect, type Page } from '@playwright/test';

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

test.describe('Public Wiki Content API read workflow', () => {
  test('API key lists and reads published page source without internal frontend routes', async ({ page }) => {
    const timestamp = Date.now();
    const path = `public-api-read-${timestamp}`;

    await login(page);
    const editKey = await createApiKey(page, `Public API Edit ${timestamp}`, ['View', 'Create', 'Edit']);
    const readKey = await createApiKey(page, `Public API Read ${timestamp}`, ['View']);

    const createResponse = await page.request.post('/api/v1/pages?include=latestRevision', {
      headers: { Authorization: `Bearer ${editKey}` },
      data: { path, title: 'Public API Read', contentSource: '# Public API Read' },
    });
    expect(createResponse.status()).toBe(201);
    const createdPage = await createResponse.json();
    expect(createdPage.latestRevision?.version).toBe(1);

    const publishResponse = await page.request.post(`/api/v1/pages/${createdPage.id}/revisions/1/publication`, {
      headers: { Authorization: `Bearer ${editKey}` },
      data: {},
    });
    expect(publishResponse.status()).toBe(200);

    const listResponse = await page.request.get('/api/v1/pages?limit=10', {
      headers: { Authorization: `Bearer ${readKey}` },
    });
    expect(listResponse.status()).toBe(200);
    const listBody = await listResponse.json();
    const item = listBody.items.find((pageItem: { path: string }) => pageItem.path === path);
    expect(item).toBeTruthy();

    const readResponse = await page.request.get(`/api/v1/pages?path=${path}`, {
      headers: { Authorization: `Bearer ${readKey}` },
    });
    expect(readResponse.status()).toBe(200);
    const readBody = await readResponse.json();
    expect(readBody.items).toHaveLength(1);
    expect(readBody.items[0].contentSource).toBe('# Public API Read');
  });
});
