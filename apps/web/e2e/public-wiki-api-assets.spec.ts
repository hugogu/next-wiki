import { test, expect, type Page } from '@playwright/test';

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

test.describe('Public Wiki Content API asset workflow', () => {
  test('uploads an asset and receives a Markdown reference', async ({ page }) => {
    const timestamp = Date.now();
    await login(page);
    const key = await createApiKey(page, `Public API Assets ${timestamp}`, ['View', 'Create', 'Edit']);

    const response = await page.request.post('/api/v1/assets', {
      headers: { Authorization: `Bearer ${key}` },
      multipart: { file: { name: 'pixel.png', mimeType: 'image/png', buffer: PNG_BUFFER } },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.markdown).toContain(`/api/v1/assets/${body.id}/content`);
  });
});
