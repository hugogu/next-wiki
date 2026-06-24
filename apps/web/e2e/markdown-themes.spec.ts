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

test.describe('markdown reading themes', () => {
  test('user sees built-ins, copies, edits, and activates a personal theme', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/user-center/reading-theme');

    await expect(page.getByRole('heading', { name: 'Markdown reading theme', level: 1 })).toBeVisible();

    // Both built-ins are listed and read-only.
    await page.getByRole('button', { name: /Wiki.js-inspired/ }).click();
    await expect(page.getByText('Built-in themes are read-only.')).toBeVisible();
    await expect(page.getByLabel('Theme stylesheet')).toHaveValue(/font-size/);

    // Copy → editable personal theme.
    await page.getByRole('button', { name: 'Copy to edit' }).click();
    await expect(page.getByText('Copy created.')).toBeVisible();

    // Edit, rename, save.
    await page.getByLabel('Theme name').fill('My Reading Theme');
    await page.getByLabel('Theme stylesheet').fill('h1 { font-size: 3rem; }');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Theme saved.')).toBeVisible();

    // Activate.
    await page.getByRole('button', { name: 'Activate' }).click();
    await expect(page.getByText('Theme activated.')).toBeVisible();
  });
});
