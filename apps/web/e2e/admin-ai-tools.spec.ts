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

async function registerReader(page: Page, email: string) {
  await page.goto('/auth/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('/');
}

test.describe('Admin AI Tools configuration', () => {
  test('admin can view the built-in provider, tools, and change a tool policy', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/ai/tools');

    // Built-in provider and future external provider are both shown.
    await expect(page.getByText('next-wiki', { exact: false }).first()).toBeVisible();
    await expect(
      page.getByText('External MCP providers are not available in this phase.'),
    ).toBeVisible();

    // Tool rows render across categories.
    await expect(page.getByText('search_wiki')).toBeVisible();
    await expect(page.getByText('rename_tag')).toBeVisible();

    // Disable a mutating tool through the UI and confirm it persists server-side.
    const toggle = page.getByRole('switch', { name: /rename_tag/ });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/ai/tools/policies') && response.request().method() === 'PATCH',
      ),
      toggle.click(),
    ]);
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    const listing = await page.request.get('/api/ai/tools');
    expect(listing.ok()).toBe(true);
    const body = (await listing.json()) as { tools: Array<{ name: string; enabled: boolean }> };
    expect(body.tools.find((tool) => tool.name === 'rename_tag')?.enabled).toBe(false);

    // Restore for isolation.
    await page.request.patch('/api/ai/tools/policies', {
      data: { providerKey: 'next-wiki', toolName: 'rename_tag', enabled: true },
    });
  });

  test('disabling the tag category server-side disables every tag tool', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const patched = await page.request.patch('/api/ai/tools/policies', {
      data: { providerKey: 'next-wiki', category: 'tag', enabled: false },
    });
    expect(patched.ok()).toBe(true);

    const listing = await page.request.get('/api/ai/tools');
    const body = (await listing.json()) as { tools: Array<{ name: string; category: string; enabled: boolean }> };
    const tagTools = body.tools.filter((tool) => tool.category === 'tag');
    expect(tagTools.length).toBeGreaterThan(0);
    expect(tagTools.every((tool) => tool.enabled === false)).toBe(true);

    // Restore for isolation.
    await page.request.patch('/api/ai/tools/policies', {
      data: { providerKey: 'next-wiki', category: 'tag', enabled: true },
    });
  });

  test('non-admin cannot open the Admin Tools page (404, no existence leak)', async ({ page }) => {
    await registerReader(page, `tools-reader-${Date.now()}@example.com`);
    await page.goto('/admin/ai/tools');
    await expect(page.locator('h1:has-text("404")')).toBeVisible();
  });
});
