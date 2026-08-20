import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('admin123');
  await page.getByRole('main').getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL('/');
}

async function createAndPublishPage(page: Page, path: string, title: string) {
  await page.goto('/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Path').fill(path);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(`/edit/${path}`);
  await page.locator('.cm-content').fill('Body content for the metadata regression test.');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(`/h/${path}?compare=1..2`);
  await page.getByRole('button', { name: /publish this revision/i }).first().click();
  await page.waitForURL(`/wiki/${path}`);
}

test.describe('reader page metadata', () => {
  // Regression test: a signed-in reader's request is proxied to the internal
  // (user)/registered-reader route (see apps/web/proxy.ts) so authenticated
  // traffic never enters the anonymous ISR cache. That route's
  // generateMetadata used to return a bare `{ robots: noindex }` stub, so
  // every page a logged-in user viewed showed the root layout's fallback
  // title/canonical instead of its own. Anonymous requests never hit that
  // route, so this bug was invisible to a plain (logged-out) curl/browser
  // check — it only reproduces while authenticated.
  test('shows the page-specific title and canonical URL, not the site root fallback, for a signed-in reader', async ({ page }) => {
    await login(page);
    const path = `reader-metadata-${Date.now()}`;
    const title = 'Reader Metadata Regression';
    await createAndPublishPage(page, path, title);

    await expect(page).toHaveTitle(new RegExp(`^${title} ·`));
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toContain(`/wiki/${path}`);
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toBe('noindex, nofollow');
  });
});
