import { expect, test, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('main').getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
}

test.describe('admin search settings', () => {
  test('persists individual lexical switches and prevents disabling both', async ({ page }) => {
    await login(page);
    await page.goto('/admin/search');

    const fullText = page.getByRole('switch', { name: 'Full-text search' });
    const fuzzy = page.getByRole('switch', { name: 'Fuzzy search' });
    await expect(fullText).toBeChecked();
    await expect(fuzzy).toBeChecked();

    await fullText.click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await page.reload();
    await expect(fullText).not.toBeChecked();
    await expect(fuzzy).toBeChecked();

    await fuzzy.click();
    await expect(page.getByText('Keep full-text search or fuzzy search enabled.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

    await fullText.click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
  });
});
