import { test, expect, type Page } from '@playwright/test';
import {revokeAllApiKeys, clickSignInSubmit} from './test-helpers';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await clickSignInSubmit(page);
  await page.waitForURL('/');
}

async function createApiKey(page: Page, name: string, scopes: string[]): Promise<string> {
  await page.goto('/user-center/api-keys');
  await page.getByRole('button', { name: 'Create API key' }).first().click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  for (const scope of scopes) {
    await page.getByRole('checkbox', { name: scope }).check();
  }
  await page.locator('form').getByRole('button', { name: 'Create API key' }).click();
  const code = page.locator('code').filter({ hasText: /^nwk_/ });
  await expect(code).toBeVisible();
  const secret = (await code.textContent())?.trim();
  if (!secret) throw new Error('API key secret not found');
  await page.getByRole('button', { name: 'Close' }).click();
  return secret;
}

function pageParam(url: string): string | null {
  return new URL(url, 'http://localhost').searchParams.get('page');
}

test.describe('unified pagination', () => {
  test.afterEach(async ({ page }) => {
    await revokeAllApiKeys(page);
  });

  test('page lives in the URL, clamps invalid input, and disables boundaries', async ({ page }) => {
    // Logs in as the seeded admin directly — the admin audit log is a global,
    // admin-only view (GET /admin/api-audit 404s for non-admins), and the
    // seeded admin@example.com is always created first at server boot (via
    // NEXT_WIKI_SEED), so a freshly registered account is never admin here.
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const key = await createApiKey(page, `Pagination View ${Date.now()}`, ['View']);

    // Generate more than one page (pageSize is 20) of audited requests. The
    // admin's audit log also accumulates entries from every other spec in the
    // suite, so this test does not assume an exact total or a specific "last
    // page" number.
    for (let i = 0; i < 25; i += 1) {
      await page.request.get('/api/v1/pages', { headers: { Authorization: `Bearer ${key}` } });
    }

    await page.goto('/admin/api-audit');
    const nav = page.getByRole('navigation', { name: 'Pagination' });
    await expect(nav).toBeVisible();

    // On page 1, First/Previous are disabled (rendered as aria-disabled spans).
    await expect(nav.locator('[aria-label="First"]')).toHaveAttribute('aria-disabled', 'true');
    await expect(nav.locator('[aria-label="Previous"]')).toHaveAttribute('aria-disabled', 'true');

    // proxy.ts now records every page visit as an audit entry, so the total
    // count (and thus the "last page" number) grows with each navigation in
    // this test. Every assertion below is internally consistent — compared
    // against the UI's current notion of "last page" rather than a number
    // captured earlier.

    // The Last link's page param round-trips through the URL and survives a
    // refresh (FR-021). A growing total can only add pages, so the captured
    // page number stays valid across reload.
    const lastPageLink = nav.getByRole('link', { name: 'Last' });
    const lastPage = pageParam(await lastPageLink.getAttribute('href') ?? '');
    expect(lastPage).toBeTruthy();
    await lastPageLink.click();
    await expect(page).toHaveURL(new RegExp(`[?&]page=${lastPage}\\b`));
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`[?&]page=${lastPage}\\b`));

    // On the last page, Next/Last are disabled (FR-022) and a page beyond the
    // last clamps down to it (FR-023). Reach the last page via the clamp path
    // (?page=99999): the server response is its current last page, and that
    // navigation's own audit entry is written only after the response — so the
    // rendered page is guaranteed to be the last page regardless of prior count
    // growth. On the last page the Next/Last controls render as disabled
    // <span>s (not links), so match them by aria-label and assert the URL no
    // longer holds the out-of-range value.
    await page.goto('/admin/api-audit?page=99999');
    await expect(page).not.toHaveURL(/[?&]page=99999/);
    await expect(nav.locator('[aria-label="Next"]')).toHaveAttribute('aria-disabled', 'true');
    await expect(nav.locator('[aria-label="Last"]')).toHaveAttribute('aria-disabled', 'true');

    // Invalid page params never error (FR-023).
    for (const bad of ['0', '-3', 'abc']) {
      await page.goto(`/admin/api-audit?page=${bad}`);
      await expect(page.getByRole('navigation', { name: 'Pagination' })).toBeVisible();
    }
  });
});
