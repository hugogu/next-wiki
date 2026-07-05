import { test, expect, type Page } from '@playwright/test';

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

test.describe('AI curation API — keyword + frontmatter + semantic search (010)', () => {
  test('narrows keyword search by frontmatter filter and exposes frontmatter on page reads', async ({ page }) => {
    const timestamp = Date.now();
    const path = `ai-curation-search-${timestamp}`;
    await login(page);
    const key = await createApiKey(page, `AI Curation Search ${timestamp}`, ['View', 'Create', 'Edit']);

    const architecturePath = `${path}/architecture`;
    const securityPath = `${path}/security`;

    const createArch = await page.request.post('/api/v1/pages', {
      headers: { Authorization: `Bearer ${key}` },
      data: {
        path: architecturePath,
        title: 'Curation Architecture',
        contentSource: '---\ntags: [architecture]\n---\n\n# auth design overview',
      },
    });
    expect(createArch.status()).toBe(201);
    const archPage = await createArch.json();
    await page.request.post(`/api/v1/pages/${archPage.id}/revisions/1/publication`, {
      headers: { Authorization: `Bearer ${key}` },
      data: {},
    });

    const createSecurity = await page.request.post('/api/v1/pages', {
      headers: { Authorization: `Bearer ${key}` },
      data: {
        path: securityPath,
        title: 'Curation Security',
        contentSource: '---\ntags: [security]\n---\n\n# auth design overview',
      },
    });
    expect(createSecurity.status()).toBe(201);
    const securityPage = await createSecurity.json();
    await page.request.post(`/api/v1/pages/${securityPage.id}/revisions/1/publication`, {
      headers: { Authorization: `Bearer ${key}` },
      data: {},
    });

    // Read the page back and confirm frontmatter round-trips.
    const read = await page.request.get(`/api/v1/pages/${archPage.id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(read.status()).toBe(200);
    expect((await read.json()).frontmatter).toEqual({ tags: ['architecture'] });

    // Unfiltered: both pages match "auth".
    const unfiltered = await page.request.get(`/api/v1/search/pages?q=auth&pathPrefix=${encodeURIComponent(path)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(unfiltered.status()).toBe(200);
    expect((await unfiltered.json()).items.length).toBe(2);

    // Filtered: only the architecture-tagged page matches.
    const filtered = await page.request.get(
      `/api/v1/search/pages?q=auth&pathPrefix=${encodeURIComponent(path)}&${encodeURIComponent('filter[tag]')}=architecture`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    expect(filtered.status()).toBe(200);
    const filteredBody = await filtered.json();
    expect(filteredBody.items.length).toBe(1);
    expect(filteredBody.items[0].page.path).toBe(architecturePath);

    // Audit log recorded the search request.
    const audit = await page.request.get('/api/audit');
    expect(audit.status()).toBe(200);
    const auditBody = await audit.json();
    expect(auditBody.entries.some((entry: { path: string }) => entry.path.includes('/search/pages'))).toBe(true);
  });

  test('semantic search enforces the view + ai.read scope pair before disclosing index state', async ({ page }) => {
    const timestamp = Date.now();
    await login(page);
    // AI must be enabled globally for the index-readiness check (409) to be
    // reachable at all — otherwise assertAiFeature fails closed first with
    // AI_DISABLED, which would mask the behavior this test targets.
    await page.request.patch('/api/ai/settings', { data: { enabled: true } });
    const viewOnlyKey = await createApiKey(page, `AI Curation View Only ${timestamp}`, ['View']);
    const aiReadOnlyKey = await createApiKey(page, `AI Curation AI Read Only ${timestamp}`, ['AI read']);
    const bothKey = await createApiKey(page, `AI Curation Both ${timestamp}`, ['View', 'AI read']);

    const viewOnlyAttempt = await page.request.post('/api/v1/search/semantic', {
      headers: { Authorization: `Bearer ${viewOnlyKey}` },
      data: { q: 'authentication design' },
    });
    expect(viewOnlyAttempt.status()).toBe(403);

    const aiReadOnlyAttempt = await page.request.post('/api/v1/search/semantic', {
      headers: { Authorization: `Bearer ${aiReadOnlyKey}` },
      data: { q: 'authentication design' },
    });
    expect(aiReadOnlyAttempt.status()).toBe(403);

    // With both scopes, the request is accepted at the permission layer; without a
    // configured embedding provider in this environment the index is never ready,
    // which is itself the documented negative-path contract (409 INDEX_NOT_READY),
    // not a permission failure.
    const bothAttempt = await page.request.post('/api/v1/search/semantic', {
      headers: { Authorization: `Bearer ${bothKey}` },
      data: { q: 'authentication design' },
    });
    expect(bothAttempt.status()).toBe(409);
    expect((await bothAttempt.json()).code).toBe('INDEX_NOT_READY');
  });
});
