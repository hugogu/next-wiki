import { test, expect, type Page } from '@playwright/test';
import { clickSignInSubmit } from './test-helpers';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function register(page: Page, email: string, password: string) {
  await page.goto('/auth/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('/');
}

async function loginAsAdmin(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill(ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD);
  await clickSignInSubmit(page);
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

  test('lets a registered user query a tag within the read-only page scope', async ({ page }) => {
    const timestamp = Date.now();
    const path = `readonly-tag-${timestamp}`;
    const tag = `readonly-tag-${timestamp}`;
    await loginAsAdmin(page);

    const create = await page.request.post('/api/v1/pages?include=latestRevision', {
      data: {
        path,
        title: 'Read-only tagged page',
        contentSource: `---\ntags:\n  - ${tag}\n---\n\n# Read-only tagged page`,
      },
    });
    expect(create.status()).toBe(201);
    const created = await create.json() as {
      id: string;
      latestRevision: { id: string; version: number };
    };
    const publish = await page.request.post(`/api/v1/pages/${created.id}/revisions/${created.latestRevision.version}/publication`, {
      data: { expectedRevisionId: created.latestRevision.id },
    });
    expect(publish.status()).toBe(200);

    await page.context().clearCookies();
    await register(page, `admin-tags-readonly-${timestamp}@example.com`, 'Password123!');
    await page.goto('/admin/tags');
    const malformedTag = await page.request.get('/api/admin/tags/not-a-uuid/pages');
    expect(malformedTag.status()).toBe(400);
    await page.getByRole('button', { name: tag, exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Related pages' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Read-only tagged page' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rename' })).toHaveCount(0);
  });

  test('masks analytics Tracking IDs for a registered user', async ({ page }) => {
    await loginAsAdmin(page);
    const update = await page.request.put('/api/settings/analytics', {
      data: {
        providers: [{
          provider: 'baidu_tongji',
          enabled: true,
          trackingId: 'abcdef0123456789abcdef0123456789',
        }],
      },
    });
    expect(update.status()).toBe(200);

    await page.context().clearCookies();
    await register(page, `analytics-readonly-${Date.now()}@example.com`, 'Password123!');
    await page.goto('/admin/analytics');

    const trackingId = page.getByText('Tracking ID', { exact: true }).locator('..').locator('input');
    await expect(trackingId).toHaveValue('••••••••');
    await expect(trackingId).toBeDisabled();
  });
});
