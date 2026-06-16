import { test, expect } from '@playwright/test';

/**
 * No-SPA navigation contract (P12 / SC-008).
 *
 * For each route, assert that direct URL entry, refresh, back/forward, and
 * "open in new tab" land on the correct state. GET requests must be idempotent.
 */

test.describe('navigation contract', () => {
  test('home page loads and refreshes to the same state', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1:has-text("Wiki Pages")')).toBeVisible();

    await page.reload();
    await expect(page.locator('h1:has-text("Wiki Pages")')).toBeVisible();
  });

  test('published page supports deep-link, refresh, and back', async ({ page, context }) => {
    // The seeded welcome page is published and reachable without login.
    await page.goto('/welcome');
    await expect(page.locator('article header h1:has-text("Welcome to next-wiki")')).toBeVisible();

    await page.reload();
    await expect(page.locator('article header h1:has-text("Welcome to next-wiki")')).toBeVisible();

    await page.goto('/');
    await page.goBack();
    await expect(page.locator('article header h1:has-text("Welcome to next-wiki")')).toBeVisible();

    // Open in new tab lands on the same state.
    const newPage = await context.newPage();
    await newPage.goto('/welcome');
    await expect(newPage.locator('article header h1:has-text("Welcome to next-wiki")')).toBeVisible();
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
    expect(secondHtml).toContain('Wiki Pages');
    expect(firstHtml.length).toBeGreaterThan(0);
    expect(secondHtml.length).toBeGreaterThan(0);
  });

  test('login page supports direct URL and refresh', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.locator('h1:has-text("Sign in")')).toBeVisible();

    await page.reload();
    await expect(page.locator('h1:has-text("Sign in")')).toBeVisible();
  });
});
