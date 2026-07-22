import { test, expect, type Page } from '@playwright/test';
import { clickSignInSubmit } from './test-helpers';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';
const SOME_ID = '11111111-1111-1111-1111-111111111111';

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

// End-to-end creation of a proposal requires a tool-calling model driving the
// loop; the apply/reject/conflict mechanics are covered by the service and
// route tests. These specs verify the governance boundaries that must hold
// regardless: Admin-only access and no exposure to public/anonymous readers.
test.describe('AI tool proposals — governance boundaries', () => {
  test('an Admin can list proposals via the API', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const response = await page.request.get('/api/ai/tool-proposals?status=pending');
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as { items: unknown[]; total: number };
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('a non-admin cannot open a proposal review page (404)', async ({ page }) => {
    await registerReader(page, `proposal-reader-${Date.now()}@example.com`);
    await page.goto(`/admin/ai/tools/proposals/${SOME_ID}`);
    await expect(page.locator('h1:has-text("404")')).toBeVisible();
  });

  test('a non-admin cannot list proposals via the API (403)', async ({ page }) => {
    await registerReader(page, `proposal-reader2-${Date.now()}@example.com`);
    const response = await page.request.get('/api/ai/tool-proposals');
    expect(response.status()).toBe(403);
  });

  test('an anonymous reader never sees proposals or unapplied tool mutations', async ({ request }) => {
    // Anonymous access to the proposals API is rejected (no existence leak),
    // and the public homepage carries no proposal/tool-call content (T089).
    const proposals = await request.get('/api/ai/tool-proposals');
    expect([401, 403]).toContain(proposals.status());
    const home = await request.get('/');
    expect(home.ok()).toBe(true);
    const html = await home.text();
    expect(html).not.toContain('tool-proposals');
    expect(html).not.toContain('tool-call');
  });
});
