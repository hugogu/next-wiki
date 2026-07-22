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

test.describe('admin site settings', () => {
  // Neither test below restores the original site name/footer/ICP number —
  // left as-is, the change (e.g. "Acme Wiki") leaks into every later spec in
  // the same sequential suite run (page titles, footer text, anything that
  // asserts the default "next-wiki" site name).
  test.afterEach(async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/site');
    await page.getByLabel('Site name').fill('next-wiki');
    await page.getByLabel('Footer copyright').fill('');
    await page.getByLabel('ICP filing number (ICP 备案号)').fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Site information updated.')).toBeVisible();
  });

  test('admin sets the site name and footer, and they appear', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/site');

    await expect(page.getByRole('heading', { name: 'Site information', level: 1 })).toBeVisible();

    await page.getByLabel('Site name').fill('Acme Wiki');
    await page.getByLabel('Footer copyright').fill('© 2026 Acme');
    await page.getByLabel('ICP filing number (ICP 备案号)').fill('京ICP备88888888号');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Site information updated.')).toBeVisible();

    // Footer renders the copyright + ICP filing on a content page.
    await page.goto('/');
    await expect(page.getByText('© 2026 Acme')).toBeVisible();
    const icp = page.getByRole('link', { name: '京ICP备88888888号' });
    await expect(icp).toBeVisible();
    await expect(icp).toHaveAttribute('href', 'https://beian.miit.gov.cn/');

    // Site name appears in the browser tab title.
    await expect(page).toHaveTitle(/Acme Wiki/);
  });

  test('empty filing fields render no compliance text', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/site');
    await page.getByLabel('ICP filing number (ICP 备案号)').fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Site information updated.')).toBeVisible();

    await page.goto('/');
    await expect(page.getByRole('link', { name: /ICP备/ })).toHaveCount(0);
  });
});
