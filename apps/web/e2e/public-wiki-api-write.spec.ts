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

test.describe('Public Wiki Content API write workflow', () => {
  test.afterEach(async ({ page }) => {
    await revokeAllApiKeys(page);
  });

  test('creates, drafts, publishes, updates, and reads history with an Editor/Admin key', async ({ page }) => {
    const timestamp = Date.now();
    const keyName = `Public API Write ${timestamp}`;
    const path = `public-api-write-${timestamp}`;

    await login(page);
    const key = await createApiKey(page, keyName, ['View', 'Create', 'Edit']);

    const create = await page.request.post('/api/v1/pages?include=latestRevision', {
      headers: { Authorization: `Bearer ${key}` },
      data: { path, title: 'Public API Write', contentSource: '# Initial' },
    });
    expect(create.status()).toBe(201);
    const created = await create.json();

    const draft = await page.request.post(`/api/v1/pages/${created.id}/drafts`, {
      headers: { Authorization: `Bearer ${key}` },
      data: { title: 'Public API Write', contentSource: '# Updated', baseRevisionId: created.latestRevision.id },
    });
    expect(draft.status()).toBe(201);
    const draftBody = await draft.json();

    const publish = await page.request.post(`/api/v1/pages/${created.id}/revisions/${draftBody.version}/publication`, {
      headers: { Authorization: `Bearer ${key}` },
      data: { expectedRevisionId: draftBody.id },
    });
    expect(publish.status()).toBe(200);

    const history = await page.request.get(`/api/v1/pages/${created.id}/revisions`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(history.status()).toBe(200);
    expect((await history.json()).items.length).toBeGreaterThanOrEqual(2);
  });
});
