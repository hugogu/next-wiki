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
  test('admin sees the authoritative Database tab, tests and saves a Local replica', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/storage');

    await expect(page.getByRole('tab', { name: /Database/ })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Database enabled' })).toBeChecked();
    await page.getByRole('tab', { name: /Local filesystem/ }).click();
    await expect(page).toHaveURL(/tab=local/);

    // Configure and test the Local backend with a writable temp directory.
    const local = page.locator('section', { hasText: 'Local filesystem' });
    await expect(local.getByLabel('Base directory')).toHaveValue('/tmp/next-wiki-e2e-content');
    await local.getByRole('button', { name: 'Test connection' }).click();
    await expect(local.getByText('Connection succeeded.')).toBeVisible({ timeout: 15_000 });

    await local.getByRole('button', { name: 'Save' }).click();
    await expect(local.getByText('Configuration saved.')).toBeVisible();
  });

  test('S3 secret field never round-trips the stored secret', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/storage');
    await page.getByRole('tab', { name: /S3-compatible/ }).click();
    await expect(page).toHaveURL(/tab=s3/);

    const s3 = page.locator('section', { hasText: 'S3-compatible storage' });
    await s3.getByLabel('Region').fill('us-east-1');
    await s3.getByLabel('Bucket').fill('wiki-content');
    await s3.getByLabel('Access key ID').fill('AKIAEXAMPLE');
    await s3.getByLabel('Secret access key').fill('top-secret-value');
    await s3.getByRole('button', { name: 'Save' }).click();
    await expect(s3.getByText('Configuration saved.')).toBeVisible();

    // After reload the secret input is empty and shows the "configured" hint.
    await page.reload();
    await expect(page.getByRole('tab', { name: /S3-compatible/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const secret = page.getByLabel('Secret access key');
    await expect(secret).toHaveValue('');
    await expect(secret).toHaveAttribute('placeholder', /configured/i);
    await page.getByRole('button', { name: 'Test connection' }).click();
    await expect(page.getByText(/Connection failed|Connection succeeded/)).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('tab', { name: /Local filesystem/ }).click();
    await expect(page.getByText(/Connection failed/)).toHaveCount(0);
  });

  test('Git export tab supports URL routing and server SSH key generation', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/storage?tab=git');

    await expect(page.getByRole('tab', { name: /Git export/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByLabel('Authentication').selectOption('ssh');
    await page.getByRole('button', { name: 'Generate SSH key' }).click();
    await expect(page.getByLabel('Server SSH public key')).toHaveValue(/^ssh-ed25519 /);
    await expect(page.getByText(/write-enabled deploy key/)).toBeVisible();
  });

  test('non-admins do not see the storage admin page', async ({ page }) => {
    await registerReader(page, `storage-reader-${Date.now()}@example.com`);
    await page.goto('/admin/storage');
    await expect(page.locator('h1:has-text("404")')).toBeVisible();
  });
});
