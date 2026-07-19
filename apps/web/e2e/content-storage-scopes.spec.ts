import { test, expect, type Page } from '@playwright/test';
import { clickSignInSubmit } from './test-helpers';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await clickSignInSubmit(page);
  await page.waitForURL('/');
}

/**
 * API-key scope governance (US4). The scope ∩ role enforcement itself is covered
 * exhaustively by unit tests (permissions, storage-config, user-center); this
 * e2e verifies the new scopes are selectable and that a created key surfaces
 * them, plus the end-to-end Bearer behavior for the storage scope.
 */
test.describe('storage & preferences API-key scopes', () => {
  test('exposes the new scopes when creating a key', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/user-center/api-keys');
    await page.getByRole('button', { name: /create|new key/i }).first().click();

    await expect(page.getByText('Storage', { exact: true })).toBeVisible();
    await expect(page.getByText('Preferences', { exact: true })).toBeVisible();
  });

  test('an admin key with the storage scope can read storage config; without it is denied', async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Key creation is session-only, so use page.request to carry the login
    // cookie; the Bearer calls below authenticate with the minted key instead.
    const withStorage = await page.request.post('/api/api-keys', {
      data: { name: `e2e-storage-${Date.now()}`, scopes: ['storage'] },
    });
    expect(withStorage.ok()).toBeTruthy();
    const storageKey = (await withStorage.json()).keySecret as string;

    const okRes = await page.request.get('/api/storage', {
      headers: { Authorization: `Bearer ${storageKey}` },
    });
    expect(okRes.status()).toBe(200);

    // A key without the storage scope is treated as if the surface does not exist.
    const withoutStorage = await page.request.post('/api/api-keys', {
      data: { name: `e2e-nostorage-${Date.now()}`, scopes: ['view'] },
    });
    const viewKey = (await withoutStorage.json()).keySecret as string;
    const deniedRes = await page.request.get('/api/storage', {
      headers: { Authorization: `Bearer ${viewKey}` },
    });
    expect(deniedRes.status()).toBe(404);
  });
});
