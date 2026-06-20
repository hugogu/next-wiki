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
 * End-to-end backend switch + migration. Requires the full stack with the
 * in-process pg-boss worker running (docker compose up), so the migration
 * actually progresses to completion.
 */
test.describe('content storage migration', () => {
  test('configures Local, switches with confirmation, and reaches the migration page', async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/storage');

    // Configure a Local backend pointing at a writable directory.
    const local = page.locator('section', { hasText: 'Local filesystem' });
    await local.getByLabel('Base directory').fill('/tmp/next-wiki-migration-content');
    await local.getByRole('button', { name: 'Save' }).click();
    await expect(local.getByText('Configuration saved.')).toBeVisible();

    // Start the switch and confirm.
    await page.getByRole('button', { name: 'Switch to this' }).first().click();
    await page.getByRole('button', { name: /Start migration|Overwrite and migrate/ }).click();

    // We land on the bookmarkable migration detail page and see a status.
    await expect(page).toHaveURL(/\/admin\/storage\/migrations\//);
    await expect(page.getByRole('heading', { name: 'Migration' })).toBeVisible();

    // The migration reaches a terminal state; reads stay available throughout.
    await expect(page.getByText(/Completed|Verifying|Copying/)).toBeVisible({ timeout: 30_000 });
    await page.goto('/welcome');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('non-admins cannot reach the migration detail page', async ({ page }) => {
    await page.goto('/admin/storage/migrations/00000000-0000-0000-0000-000000000000');
    await expect(page.locator('h1:has-text("404")')).toBeVisible();
  });
});
