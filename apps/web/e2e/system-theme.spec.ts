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

test.describe('admin system theme', () => {
  test('admin writes CSS and it is injected on the next page', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/appearance');

    await expect(page.getByRole('heading', { name: 'Appearance', level: 1 })).toBeVisible();

    const textarea = page.getByLabel('System theme stylesheet');
    await textarea.fill('.header { display: flex; gap: 1rem; }');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('System theme updated.')).toBeVisible();

    await page.goto('/');
    const css = await page.locator('#app-system-theme').innerText();
    expect(css).toContain('display: flex');
  });

  test('color declarations are stripped on save', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/appearance');

    await page
      .getByLabel('System theme stylesheet')
      .fill('.x { color: red; background: blue; padding: 1rem; }');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await page.goto('/');
    const css = await page.locator('#app-system-theme').innerText();
    expect(css).not.toContain('color');
    expect(css).not.toContain('background');
    expect(css).toContain('padding: 1rem');
  });
});
