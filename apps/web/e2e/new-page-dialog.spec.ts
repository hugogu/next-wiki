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

test.describe('new page dialog', () => {
  test('shows immediately with no editor behind it, and blocks empty submission', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/new');

    await expect(page.getByLabel('Title')).toBeVisible();
    await expect(page.locator('.cm-content')).toHaveCount(0);

    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByLabel('Title')).toBeVisible();
  });

  test('creating with a valid title and path redirects into the editor', async ({ page }) => {
    const path = `new-page-dialog-${Date.now()}`;
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/new');

    await page.getByLabel('Title').fill('New Page Dialog Test');
    await page.getByLabel('Path').fill(path);
    await page.getByRole('button', { name: 'Create' }).click();

    await page.waitForURL(`/edit/${path}`);
    await expect(page.locator('.cm-content')).toBeVisible();
  });

  test('creating at an existing path shows a conflict error and keeps the dialog open', async ({ page }) => {
    const path = `new-page-dialog-conflict-${Date.now()}`;
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await page.goto('/new');
    await page.getByLabel('Title').fill('First');
    await page.getByLabel('Path').fill(path);
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForURL(`/edit/${path}`);

    await page.goto('/new');
    await page.getByLabel('Title').fill('Second');
    await page.getByLabel('Path').fill(path);
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText('A page with this path already exists.')).toBeVisible();
    await expect(page.getByLabel('Title')).toBeVisible();
  });

  test('closing the dialog without submitting creates nothing', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/new');

    await expect(page.getByLabel('Title')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.waitForURL('/');
  });
});
