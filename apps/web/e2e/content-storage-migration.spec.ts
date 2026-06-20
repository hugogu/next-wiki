import { test, expect, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
}

/**
 * End-to-end replica enable/backfill. Requires the full stack with the
 * in-process pg-boss worker running.
 */
test.describe('content storage replicas', () => {
  test('configures Local, enables backfill, and selects preferred reads', async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/storage');

    // Configure a Local backend pointing at a writable directory.
    await page.getByRole('tab', { name: /Local filesystem/ }).click();
    const local = page.locator('section', { hasText: 'Local filesystem' });
    await local.getByLabel('Base directory').fill('/tmp/next-wiki-migration-content');
    await local.getByRole('button', { name: 'Save' }).click();
    await expect(local.getByText('Configuration saved.')).toBeVisible();

    await page.getByRole('tab', { name: /Local filesystem/ }).click();
    const enabled = page.getByRole('switch', { name: 'Replica enabled' });
    if (!(await enabled.isChecked())) await enabled.click();
    await expect(page.getByRole('tabpanel').getByText('Enabled')).toBeVisible({
      timeout: 30_000,
    });
    const prefer = page.getByRole('button', { name: 'Prefer for reads' });
    if (await prefer.isVisible()) await prefer.click();
    await expect(page.getByRole('button', { name: 'Preferred for reads' })).toBeVisible({
      timeout: 30_000,
    });

    // Normal reads stay available throughout replica synchronization.
    await page.goto('/welcome');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('non-admins cannot reach the migration detail page', async ({ page }) => {
    await page.goto('/admin/storage/migrations/00000000-0000-0000-0000-000000000000');
    await expect(page.locator('h1:has-text("404")')).toBeVisible();
  });
});
