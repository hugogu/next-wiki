import { test, expect, type Page } from '@playwright/test';
import { clickSignInSubmit } from './test-helpers';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await clickSignInSubmit(page);
  await page.waitForURL('/');
}

async function register(page: Page, email: string, password: string) {
  await page.goto('/auth/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('/');
}

test.describe('admin integrations', () => {
  test('an admin can reach the integrations surface and see it in the navigation', async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // The navigation entry is the only path to this surface — one canonical
    // entry point, per the routing contract.
    await page.goto('/admin/site');
    await expect(page.getByRole('link', { name: 'Integrations' })).toBeVisible();

    await page.goto('/admin/integrations');
    await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();

    // GitHub is the one service today; the credential is configured here rather
    // than inside each feature that reaches it.
    await expect(page.getByText(/Used by Git export and by static site publishing/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /generate deploy key/i })).toBeVisible();
  });

  test('static site configuration points at the shared credential instead of its own', async ({
    page,
  }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/static-site');

    await expect(page.getByRole('heading', { name: /static site/i })).toBeVisible();
    // No credential fields here any more.
    await expect(page.getByText(/comes from the shared GitHub integration/i)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Integrations' }).last()).toBeVisible();
  });

  test('a non-admin gets 404 rather than a forbidden page', async ({ page }) => {
    // Hidden denial: the surface must not advertise its own existence.
    const email = `int-reader-${Date.now()}@example.com`;
    await register(page, email, 'reader-password-123');

    const response = await page.goto('/admin/integrations');
    expect(response?.status()).toBe(404);
  });
});
