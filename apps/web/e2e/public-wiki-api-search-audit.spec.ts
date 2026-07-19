import { test, expect, type Page } from '@playwright/test';
import {revokeAllApiKeys, clickSignInSubmit} from './test-helpers';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await clickSignInSubmit(page);
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

test.describe('Public Wiki Content API search and docs workflow', () => {
  test.afterEach(async ({ page }) => {
    await revokeAllApiKeys(page);
  });

  test('searches pages and exposes public API docs', async ({ page }) => {
    const timestamp = Date.now();
    const path = `public-api-search-${timestamp}`;
    await login(page);
    const key = await createApiKey(page, `Public API Search ${timestamp}`, ['View', 'Create', 'Edit']);

    const create = await page.request.post('/api/v1/pages', {
      headers: { Authorization: `Bearer ${key}` },
      data: { path, title: 'Searchable API Page', contentSource: '# Searchable API Page' },
    });
    expect(create.status()).toBe(201);
    const created = await create.json();
    await page.request.post(`/api/v1/pages/${created.id}/revisions/1/publication`, {
      headers: { Authorization: `Bearer ${key}` },
      data: {},
    });

    const search = await page.request.get('/api/v1/search/pages?q=Searchable', {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(search.status()).toBe(200);
    expect((await search.json()).items.length).toBeGreaterThan(0);

    const openapi = await page.request.get('/api/openapi.json');
    expect(await openapi.text()).toContain('/v1/pages');
  });
});
