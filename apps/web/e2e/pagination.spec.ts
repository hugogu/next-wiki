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
    await page.getByRole('checkbox', { name: scope }).check();
  }
  await page.locator('form').getByRole('button', { name: 'Create API key' }).click();
  const code = page.locator('code').filter({ hasText: /^nwk_/ });
  await expect(code).toBeVisible();
  const secret = (await code.textContent())?.trim();
  if (!secret) throw new Error('API key secret not found');
  await page.getByRole('button', { name: 'Close' }).click();
  return secret;
}

test.describe('unified pagination', () => {
  test('page lives in the URL, clamps invalid input, and disables boundaries', async ({ page }) => {
    const timestamp = Date.now();
    // The first registered user is the admin, who can view the global audit log.
    await register(page, `pagination-${timestamp}@example.com`, 'Password123!');
    const key = await createApiKey(page, 'Pagination View', ['View']);

    // Generate more than one page (pageSize is 20) of audited requests.
    for (let i = 0; i < 25; i += 1) {
      await page.request.get('/api/pages', { headers: { Authorization: `Bearer ${key}` } });
    }

    await page.goto('/admin/api-audit');
    const nav = page.getByRole('navigation', { name: 'Pagination' });
    await expect(nav).toBeVisible();

    // On page 1, First/Previous are disabled (rendered as aria-disabled spans).
    await expect(nav.locator('[aria-label="First"]')).toHaveAttribute('aria-disabled', 'true');
    await expect(nav.locator('[aria-label="Previous"]')).toHaveAttribute('aria-disabled', 'true');

    // Jump to the last page → URL carries ?page=2 and it survives a refresh (FR-021).
    await nav.getByRole('link', { name: 'Last' }).click();
    await expect(page).toHaveURL(/[?&]page=2\b/);
    await page.reload();
    await expect(page).toHaveURL(/[?&]page=2\b/);

    // On the last page, Next/Last are disabled (FR-022).
    await expect(nav.locator('[aria-label="Next"]')).toHaveAttribute('aria-disabled', 'true');
    await expect(nav.locator('[aria-label="Last"]')).toHaveAttribute('aria-disabled', 'true');

    // Invalid page params never error (FR-023).
    for (const bad of ['0', '-3', 'abc']) {
      await page.goto(`/admin/api-audit?page=${bad}`);
      await expect(page.getByRole('navigation', { name: 'Pagination' })).toBeVisible();
    }

    // Beyond the last page clamps down to the last real page (FR-023).
    await page.goto('/admin/api-audit?page=99999');
    await expect(page).toHaveURL(/[?&]page=2\b/);
  });
});
