import { test, expect, type Page } from '@playwright/test';
import { clickSignInSubmit } from './test-helpers';

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('admin123');
  await clickSignInSubmit(page);
  await page.waitForURL('/');
}

test.describe('page tags', () => {
  test('allows an administrator to create a reusable tag from page management', async ({ page }) => {
    await login(page);
    await page.goto('/admin/pages');
    await expect(page.getByRole('heading', { name: 'Tags' })).toBeVisible();
    await page.getByLabel('New tag').fill(`e2e-tag-${Date.now()}`);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Tag created.')).toBeVisible();
  });
});
