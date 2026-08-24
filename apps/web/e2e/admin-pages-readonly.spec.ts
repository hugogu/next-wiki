import { test, expect, type Page } from '@playwright/test';

async function register(page: Page, email: string, password: string) {
  await page.goto('/auth/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('/');
}

test.describe('read-only Admin pages', () => {
  test('allows a registered user to query pages without presenting mutations', async ({ page }) => {
    await register(page, `admin-pages-readonly-${Date.now()}@example.com`, 'Password123!');

    await page.goto('/admin/pages');

    await expect(page.getByRole('heading', { name: 'Page Management' })).toBeVisible();
    await expect(page.getByText(/read-only access/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply filters' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Actions' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /delete page/i })).toHaveCount(0);
  });
});
