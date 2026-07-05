import { test, expect, type Page } from '@playwright/test';
import { revokeAllApiKeys } from './test-helpers';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
}

async function createApiKey(page: Page, name: string, scopes: string[]): Promise<string> {
  await page.goto('/user-center/api-keys');
  await page.getByRole('button', { name: 'Create API key' }).first().click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  for (const scope of scopes) {
    await page.getByRole('checkbox', { name: new RegExp(`^${scope}`) }).check();
  }
  await page.locator('form').getByRole('button', { name: 'Create API key' }).click();
  const code = page.locator('code').filter({ hasText: /^nwk_/ });
  await expect(code).toBeVisible();
  const secret = (await code.textContent())?.trim();
  if (!secret) throw new Error('API key secret not found');
  await page.getByRole('button', { name: 'Close' }).click();
  return secret;
}

test.describe('AI curation API — batch update/delete (010, US5)', () => {
  test.afterEach(async ({ page }) => {
    await revokeAllApiKeys(page);
  });

  test('batch update: dry_run previews then a real batch reports partial success on a path collision', async ({ page }) => {
    const timestamp = Date.now();
    const prefix = `ai-curation-batch-${timestamp}`;
    await login(page);
    const key = await createApiKey(page, `AI Curation Batch ${timestamp}`, ['View', 'Create', 'Edit']);

    const pages: Array<{ id: string; path: string; baseRevisionId: string }> = [];
    for (let i = 0; i < 3; i++) {
      const path = `${prefix}/${i}`;
      const create = await page.request.post('/api/v1/pages?include=latestRevision', {
        headers: { Authorization: `Bearer ${key}` },
        data: { path, title: `Batch ${i}`, contentSource: `# Batch ${i}` },
      });
      expect(create.status()).toBe(201);
      const body = await create.json();
      pages.push({ id: body.id, path, baseRevisionId: body.latestRevision.id });
    }

    // Dry run: no write, preview only.
    const dryRun = await page.request.post('/api/v1/pages/batch/update?dry_run=true', {
      headers: { Authorization: `Bearer ${key}` },
      data: { items: [{ pageId: pages[0]!.id, title: 'Dry Run Title', baseRevisionId: pages[0]!.baseRevisionId }] },
    });
    expect(dryRun.status()).toBe(200);
    const dryRunBody = await dryRun.json();
    expect(dryRunBody.dryRun).toBe(true);
    expect(dryRunBody.results[0]).toMatchObject({ status: 'success', preview: { title: 'Dry Run Title' } });

    const unchanged = await page.request.get(`/api/v1/pages/${pages[0]!.id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect((await unchanged.json()).title).toBe('Batch 0');

    // Real batch: item 0 collides with item 1's existing path; items 1 and 2 still succeed.
    const batch = await page.request.post('/api/v1/pages/batch/update', {
      headers: { Authorization: `Bearer ${key}` },
      data: {
        items: [
          { pageId: pages[0]!.id, path: pages[1]!.path, baseRevisionId: pages[0]!.baseRevisionId },
          { pageId: pages[1]!.id, title: 'Renamed 1', baseRevisionId: pages[1]!.baseRevisionId },
          { pageId: pages[2]!.id, title: 'Renamed 2', baseRevisionId: pages[2]!.baseRevisionId },
        ],
      },
    });
    expect(batch.status()).toBe(200);
    const batchBody = await batch.json();
    expect(batchBody.successCount).toBe(2);
    expect(batchBody.failureCount).toBe(1);
    const failed = batchBody.results.find((r: { status: string }) => r.status === 'failed');
    expect(failed.error.code).toBe('PAGE_PATH_CONFLICT');

    // A Reader-scoped key is rejected at the batch boundary.
    const readerKey = await createApiKey(page, `AI Curation Reader ${timestamp}`, ['View']);
    const readerAttempt = await page.request.post('/api/v1/pages/batch/update', {
      headers: { Authorization: `Bearer ${readerKey}` },
      data: { items: [{ pageId: pages[2]!.id, title: 'Should not apply', baseRevisionId: pages[2]!.baseRevisionId }] },
    });
    expect(readerAttempt.status()).toBe(403);
  });

  test('batch delete: dry_run previews without deleting, then a real batch soft-deletes', async ({ page }) => {
    const timestamp = Date.now();
    const prefix = `ai-curation-batch-delete-${timestamp}`;
    await login(page);
    const key = await createApiKey(page, `AI Curation Batch Delete ${timestamp}`, ['View', 'Create', 'Edit', 'Delete']);

    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const path = `${prefix}/${i}`;
      const create = await page.request.post('/api/v1/pages', {
        headers: { Authorization: `Bearer ${key}` },
        data: { path, title: `Batch Delete ${i}`, contentSource: `# Batch Delete ${i}` },
      });
      expect(create.status()).toBe(201);
      ids.push((await create.json()).id);
    }

    const dryRun = await page.request.post('/api/v1/pages/batch/delete?dry_run=true', {
      headers: { Authorization: `Bearer ${key}` },
      data: { pageIds: ids },
    });
    expect(dryRun.status()).toBe(200);
    expect((await dryRun.json()).dryRun).toBe(true);

    const stillThere = await page.request.get(`/api/v1/pages/${ids[0]}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(stillThere.status()).toBe(200);

    const batch = await page.request.post('/api/v1/pages/batch/delete', {
      headers: { Authorization: `Bearer ${key}` },
      data: { pageIds: ids },
    });
    expect(batch.status()).toBe(200);
    const batchBody = await batch.json();
    expect(batchBody.successCount).toBe(3);
    expect(batchBody.failureCount).toBe(0);

    const gone = await page.request.get(`/api/v1/pages/${ids[0]}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(gone.status()).toBe(404);
  });
});
