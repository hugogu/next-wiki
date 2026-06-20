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

async function registerReader(page: Page, email: string) {
  await page.goto('/auth/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('/');
}

test.describe('admin content storage', () => {
  test('admin sees the active Database backend, tests and saves a Local backend', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/storage');

    await expect(page.getByRole('heading', { name: 'Active backend' })).toBeVisible();
    await expect(page.getByText('Database', { exact: true })).toBeVisible();

    // Configure and test the Local backend with a writable temp directory.
    const local = page.locator('section', { hasText: 'Local filesystem' });
    await local.getByLabel('Base directory').fill('/tmp/next-wiki-e2e-content');
    await local.getByRole('button', { name: 'Test connection' }).click();
    await expect(local.getByText('Connection succeeded.')).toBeVisible({ timeout: 15_000 });

    await local.getByRole('button', { name: 'Save' }).click();
    await expect(local.getByText('Configuration saved.')).toBeVisible();
  });

  test('S3 secret field never round-trips the stored secret', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/storage');

    const s3 = page.locator('section', { hasText: 'S3-compatible storage' });
    await s3.getByLabel('Region').fill('us-east-1');
    await s3.getByLabel('Bucket').fill('wiki-content');
    await s3.getByLabel('Access key ID').fill('AKIAEXAMPLE');
    await s3.getByLabel('Secret access key').fill('top-secret-value');
    await s3.getByRole('button', { name: 'Save' }).click();
    await expect(s3.getByText('Configuration saved.')).toBeVisible();

    // After reload the secret input is empty and shows the "configured" hint.
    await page.reload();
    const secret = s3.getByLabel('Secret access key');
    await expect(secret).toHaveValue('');
    await expect(secret).toHaveAttribute('placeholder', /configured/i);
  });

  test('non-admins do not see the storage admin page', async ({ page }) => {
    await registerReader(page, `storage-reader-${Date.now()}@example.com`);
    await page.goto('/admin/storage');
    await expect(page.locator('h1:has-text("404")')).toBeVisible();
  });
});
