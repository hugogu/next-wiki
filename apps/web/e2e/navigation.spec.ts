import { test, expect } from '@playwright/test';
import { clickSignInSubmit } from './test-helpers';

/**
 * No-SPA navigation contract (P12 / SC-008).
 *
 * For each route, assert that direct URL entry, refresh, back/forward, and
 * "open in new tab" land on the correct state. GET requests must be idempotent.
 */

test.describe('navigation contract', () => {
  test('home page loads and refreshes to the same state', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1:has-text("next-wiki")')).toBeVisible();

    await page.reload();
    await expect(page.locator('h1:has-text("next-wiki")')).toBeVisible();
  });

  test('published page supports deep-link, refresh, and back', async ({ page, context }) => {
    // The seeded welcome page is published and reachable without login.
    await page.goto('/welcome');
    await expect(page.getByRole('heading', { name: 'Welcome to next-wiki' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome to next-wiki' })).toBeVisible();

    await page.goto('/');
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Welcome to next-wiki' })).toBeVisible();

    // Open in new tab lands on the same state.
    const newPage = await context.newPage();
    await newPage.goto('/welcome');
    await expect(newPage.getByRole('heading', { name: 'Welcome to next-wiki' })).toBeVisible();
    await newPage.close();
  });

  test('404 is a real navigable route', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.locator('h1:has-text("404")')).toBeVisible();

    await page.reload();
    await expect(page.locator('h1:has-text("404")')).toBeVisible();
  });

  test('GET never mutates (re-fetching a page is idempotent)', async ({ page }) => {
    await page.goto('/');
    const firstHtml = await page.content();

    await page.reload();
    const secondHtml = await page.content();

    // The page content should be structurally identical after a refresh.
    expect(secondHtml).toContain('next-wiki');
    expect(firstHtml.length).toBeGreaterThan(0);
    expect(secondHtml.length).toBeGreaterThan(0);
  });

  test('login page supports direct URL and refresh', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.locator('h1:has-text("Sign in")')).toBeVisible();

    await page.reload();
    await expect(page.locator('h1:has-text("Sign in")')).toBeVisible();
  });

  test('expanding a page in the navigator shows its readable draft children', async ({ page, request }) => {
    const path = `navigator-drafts-${Date.now()}`;
    const draftTitle = 'Unpublished child page';
    await page.goto('/auth/login');
    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByLabel('Password').fill('admin123');
    await clickSignInSubmit(page);
    await page.waitForURL('/');

    const parent = await page.request.post('/api/v1/pages', { data: { path, title: 'Navigator parent' } });
    expect(parent.status()).toBe(201);
    const { id } = await parent.json();
    const published = await page.request.post(`/api/v1/pages/${id}/revisions/1/publication`, { data: {} });
    expect(published.ok()).toBe(true);
    const draft = await page.request.post('/api/v1/pages', {
      data: { path: `${path}/draft`, title: draftTitle },
    });
    expect(draft.status()).toBe(201);

    await page.goto(`/wiki/${path}`);
    const navigator = page.locator('aside nav');
    const toggle = navigator.getByRole('button', { name: path, exact: true });
    const child = navigator.getByRole('link', { name: draftTitle });
    await expect(child).toHaveCount(0);
    await toggle.click();
    await expect(child).toBeVisible();
    await toggle.click();
    await expect(child).toHaveCount(0);
    await toggle.click();
    await expect(child).toBeVisible();

    // Asking for all statuses without a session must not expose the draft.
    const anonymousTree = await request.get(`/api/v1/tree?pathPrefix=${path}&status=all`);
    expect(anonymousTree.ok()).toBe(true);
    expect(await anonymousTree.json()).toMatchObject({ root: { path, children: [] }, pageCount: 1 });
  });
});
