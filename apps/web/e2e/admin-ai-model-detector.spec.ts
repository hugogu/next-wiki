import { test, expect, type Page } from '@playwright/test';

/**
 * Admin AI Model Capability Detector coverage.
 *
 * These flows exercise the Cloudflare detector configuration and detector-backed
 * model sync from the admin AI page. They are marked `fixme` until the e2e
 * environment provides a server-side Cloudflare test double: the detector's
 * model-search / model-schema calls run inside the Next server process, so
 * Playwright's browser-level `page.route` cannot intercept them. A future
 * fixture should point the detector base URL at a local stub (or inject a fake
 * detector via an e2e-only env flag) so these can run deterministically offline.
 *
 * Selector inventory (source of truth for the UI under test):
 * - Provider form detector select:   getByLabel('Model capability detector')
 * - Cloudflare account id:            getByLabel('Cloudflare account ID')
 * - API key:                          getByLabel('API key')
 * - Sync action button (per row):     getByRole('button', { name: /sync/i })
 * - Sync-started feedback:            getByText(/Model sync started/i)
 * - Model catalog detector badge:     getByText('Cloudflare')      (in model row)
 * - Partial enrichment badge:         getByText('Partial')
 * - Manual override marker tooltip:   'Manual override'
 * - Run records / action status:      /admin/ai run-record surface
 */

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
}

test.describe('admin AI model capability detector', () => {
  test.fixme('configures a Cloudflare detector without exposing the stored token', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/ai');

    // Open the chat provider form and select the Cloudflare detector.
    await page.getByRole('button', { name: /add/i }).first().click();
    await page.getByLabel('Model capability detector').selectOption('cloudflare');
    await expect(page.getByLabel('Cloudflare account ID')).toBeVisible();
    await page.getByLabel('Cloudflare account ID').fill('acct-e2e');
    await page.getByLabel('API key').fill('cf-e2e-token');
    await page.getByRole('button', { name: /create/i }).click();

    // The stored token never round-trips back to the client.
    await expect(page.getByText('cf-e2e-token')).toHaveCount(0);
  });

  test.fixme('starts a detector-backed sync and shows result counts and provenance', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/ai');

    await page.getByRole('button', { name: /sync/i }).first().click();
    await expect(page.getByText(/Model sync started/i)).toBeVisible();

    // After the action completes, the catalog shows detector provenance and any
    // partial-enrichment marker for models whose schema fetch failed.
    await expect(page.getByText('Cloudflare').first()).toBeVisible();
  });

  test.fixme('keeps a manual capability override active after a detector sync', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/ai');
    // Toggle a manual capability override, re-run sync, and confirm it persists
    // (the switch stays in its manually-set state, marked as a manual override).
  });
});
