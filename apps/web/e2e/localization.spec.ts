import { test, expect } from '@playwright/test';

test.describe('UI localization without locale routing', () => {
  test('uses the locale cookie without changing the current URL', async ({ page }) => {
    await page.context().addCookies([
      { name: 'next-wiki-locale', value: 'zh', domain: 'localhost', path: '/' },
    ]);

    await page.goto('/auth/login');

    await expect(page).toHaveURL(/\/auth\/login$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh');
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();
  });

  test('recovers from an invalid legacy locale cookie', async ({ page }) => {
    await page.context().addCookies([
      { name: 'next-wiki-locale', value: 'obsolete', domain: 'localhost', path: '/' },
    ]);

    await page.goto('/auth/login');

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});
