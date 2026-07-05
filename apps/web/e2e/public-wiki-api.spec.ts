import { test, expect, type Page } from '@playwright/test';
import { revokeAllApiKeys } from './test-helpers';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';
const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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

test.describe('Public Wiki Content API smoke workflow', () => {
  test.afterEach(async ({ page }) => {
    await revokeAllApiKeys(page);
  });

  test('creates, updates, assets, publishes, searches, and reads history', async ({ page }) => {
    const timestamp = Date.now();
    const path = `public-api-smoke-${timestamp}`;
    await login(page);
    const key = await createApiKey(page, `Public API Smoke ${timestamp}`, ['View', 'Create', 'Edit']);

    const asset = await page.request.post('/api/v1/assets', {
      headers: { Authorization: `Bearer ${key}` },
      multipart: { file: { name: 'pixel.png', mimeType: 'image/png', buffer: PNG_BUFFER } },
    });
    expect(asset.status()).toBe(201);
    const assetBody = await asset.json();

    const create = await page.request.post('/api/v1/pages?include=latestRevision', {
      headers: { Authorization: `Bearer ${key}` },
      data: { path, title: 'Public Smoke', contentSource: `# Public Smoke\n${assetBody.markdown}` },
    });
    expect(create.status()).toBe(201);
    const created = await create.json();

    const publish = await page.request.post(`/api/v1/pages/${created.id}/revisions/1/publication`, {
      headers: { Authorization: `Bearer ${key}` },
      data: { expectedRevisionId: created.latestRevision.id },
    });
    expect(publish.status()).toBe(200);

    const update = await page.request.post(`/api/v1/pages/${created.id}/drafts`, {
      headers: { Authorization: `Bearer ${key}` },
      data: { title: 'Public Smoke Updated', contentSource: '# Updated', baseRevisionId: created.latestRevision.id },
    });
    expect(update.status()).toBe(201);

    const search = await page.request.get('/api/v1/search/pages?q=Public%20Smoke', {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(search.status()).toBe(200);

    const history = await page.request.get(`/api/v1/pages/${created.id}/revisions`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(history.status()).toBe(200);
    expect((await history.json()).items.length).toBeGreaterThanOrEqual(2);
  });
});
