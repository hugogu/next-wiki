import { test, expect, type Page } from '@playwright/test';

async function register(page: Page, email: string, password: string) {
  await page.goto('/auth/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('/');
}

test.describe('read-only Admin pages', () => {
  test('allows a registered user to query pages without presenting mutations', async ({ page }) => {
    await register(page, `admin-pages-readonly-${Date.now()}@example.com`, 'Password123!');

    await page.goto('/admin/pages');

    await expect(page.getByRole('heading', { name: 'Page Management' })).toBeVisible();
    await expect(page.getByText(/read-only access/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply filters' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Actions' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /delete page/i })).toHaveCount(0);
  });

  test('shows every supported Admin surface without its write controls', async ({ page }) => {
    await register(page, `admin-readonly-surfaces-${Date.now()}@example.com`, 'Password123!');
    await page.goto('/admin/pages');

    const navigationItems = [
      'Writing Mode', 'Spaces', 'Pages', 'Tags', 'Search', 'Providers', 'Tools', 'Jobs', 'Skills',
      'Bots', 'Site Info', 'Appearance', 'Integrations', 'Static site', 'Analytics',
    ];
    for (const item of navigationItems) {
      await expect(page.getByRole('link', { name: item, exact: true })).toBeVisible();
    }

    for (const path of [
      '/admin/writing-mode', '/admin/spaces', '/admin/tags', '/admin/search',
      '/admin/ai/providers', '/admin/ai/tools', '/admin/ai/jobs', '/admin/ai/skills',
      '/admin/bots', '/admin/site', '/admin/appearance', '/admin/integrations',
      '/admin/static-site', '/admin/analytics',
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).not.toBe(404);
    }

    await page.goto('/admin/search');
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
    await expect(page.getByRole('switch').first()).toBeDisabled();

    await page.goto('/admin/tags');
    await expect(page.getByRole('button', { name: 'Rename' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Related pages' })).toHaveCount(0);

    await page.goto('/admin/integrations');
    await expect(page.getByRole('link', { name: 'Configure' })).toHaveCount(0);
  });
});
