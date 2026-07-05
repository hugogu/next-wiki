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
