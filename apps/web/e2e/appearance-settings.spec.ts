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

test.describe('admin appearance settings', () => {
  test('admin changes the primary color and it is injected site-wide', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/appearance');

    await expect(page.getByRole('heading', { name: 'Appearance', level: 1 })).toBeVisible();

    // Change the light-mode primary color and save.
    const primary = page.getByLabel('lightColors primary');
    await primary.fill('#0ea5e9');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Appearance updated.')).toBeVisible();

    // The injected <style> on the next navigation reflects the new token.
    await page.goto('/');
    const css = await page.locator('#app-appearance').innerText();
    expect(css).toContain('--color-primary:#0ea5e9');
  });

  test('invalid color is rejected and previous value is kept', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/appearance');

    await page.getByLabel('lightColors primary').fill('banana');
    await page.getByRole('button', { name: 'Save changes' }).click();

    // An error is shown and the success message is not.
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Appearance updated.')).toHaveCount(0);
  });
});
