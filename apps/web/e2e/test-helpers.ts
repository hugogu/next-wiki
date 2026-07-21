import type { Page } from '@playwright/test';

/**
 * Revokes every currently-active API key for whichever account `page` is
 * logged in as. Several e2e specs share the seeded admin@example.com account
 * and each create one or more keys without revoking them; left uncleaned, the
 * shared account's active-key count grows across a full `pnpm test:e2e` run
 * (one server boot, one DB, tests run sequentially) and eventually exceeds
 * MAX_KEYS_PER_USER (10, see src/server/services/api-keys.ts), causing later
 * specs' "Create API key" to fail. Call this from `test.afterEach` in any
 * spec that creates keys under a shared (non-per-test) account.
 */
export async function revokeAllApiKeys(page: Page): Promise<void> {
  const response = await page.request.get('/api/api-keys');
  if (!response.ok()) return;
  const keys = (await response.json()) as Array<{ id: string; revokedAt: string | null }>;
  await Promise.all(
    keys.filter((key) => !key.revokedAt).map((key) => page.request.delete(`/api/api-keys/${key.id}`)),
  );
}

/**
 * Clicks the form's "Sign in" submit button. Scoped to `<form>` to avoid the
 * sidebar "Sign in" trigger button (NavFooterMenu) in strict-mode locators.
 */
export async function clickSignInSubmit(page: Page): Promise<void> {
  await page.locator('form').getByRole('button', { name: /sign in/i }).click();
}

/**
 * Intercepts real analytics vendor script requests so tests never depend on
 * outbound network access to `hm.baidu.com` / `googletagmanager.com`. Without
 * this, an enabled provider's dynamically-inserted `<script src="...">` is a
 * genuine pending resource the browser's `load` event waits on; if the vendor
 * host is unreachable from the test environment, `page.goto(..., {
 * waitUntil: 'load' })` (Playwright's default) hangs until timeout even
 * though the document itself rendered fine. Assertions in these specs check
 * the injected script tag and its content, not that the real vendor request
 * succeeds, so short-circuiting it here does not weaken coverage.
 */
export async function blockAnalyticsVendorRequests(page: Page): Promise<void> {
  await page.route(/hm\.baidu\.com|googletagmanager\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
  );
}
