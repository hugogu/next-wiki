import { expect, test } from '@playwright/test';

test.describe('Header hybrid page search', () => {
  test('opens after focus, waits for two characters, and navigates through a canonical result link', async ({ page }) => {
    await page.goto('/');
    const search = page.getByLabel('Search wiki pages');
    await search.focus();
    await expect(page.getByText('Type at least two characters to search.')).toBeVisible();
    await expect(search).toBeFocused();
    await expect(page.getByTestId('header-search-backdrop')).toBeVisible();
    const searchBox = await search.boundingBox();
    const resultsBox = await page.getByTestId('header-search-results').boundingBox();
    expect(searchBox).not.toBeNull();
    expect(resultsBox).not.toBeNull();
    expect(resultsBox!.y).toBeGreaterThan(searchBox!.y + searchBox!.height);

    const hybridRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/search/pages') && request.method() === 'POST') hybridRequests.push(request.postData() ?? '');
    });
    await search.fill('W');
    await page.waitForTimeout(100);
    expect(hybridRequests).toHaveLength(0);

    const response = page.waitForResponse((candidate) => candidate.url().includes('/api/v1/search/pages') && candidate.request().method() === 'POST');
    await search.fill('We');
    await response;
    const welcome = page.getByTestId('header-search-results').getByRole('link', { name: /Welcome to next-wiki/ });
    await expect(welcome).toBeVisible();
    await Promise.all([page.waitForURL('/welcome'), welcome.click()]);
  });

  test('Escape closes search once without changing the current URL', async ({ page }) => {
    await page.goto('/');
    const search = page.getByLabel('Search wiki pages');
    await search.focus();
    const response = page.waitForResponse((candidate) => candidate.url().includes('/api/v1/search/pages') && candidate.request().method() === 'POST');
    await search.fill('We');
    await response;

    let escapeEvents = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/search/pages') && request.method() === 'POST' && request.postData()?.includes('"action":"escape"')) {
        escapeEvents += 1;
      }
    });
    await page.keyboard.press('Escape');
    await expect(page.getByText('Type at least two characters to search.')).toBeHidden();
    await expect(page).toHaveURL('/');
    await expect(search).toBeFocused();
    await page.waitForTimeout(100);
    expect(escapeEvents).toBe(1);
  });

  test('keeps only the latest response and emits one result-open event', async ({ page }) => {
    const resultOpenEvents: string[] = [];
    await page.route('**/api/v1/search/pages', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as { kind?: string; q?: string; action?: string };
      if (body.kind === 'behavior' && body.action === 'result_open') {
        resultOpenEvents.push(route.request().postData() ?? '');
        await route.fulfill({ status: 204 });
        return;
      }
      if (body.kind === 'query') {
        if (body.q === 'al') await new Promise((resolve) => setTimeout(resolve, 150));
        const isLatest = body.q === 'needle';
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            searchRecordId: '11111111-1111-4111-8111-111111111111', semanticState: 'unavailable',
            items: [{
              page: { id: isLatest ? '22222222-2222-4222-8222-222222222222' : '33333333-3333-4333-8333-333333333333', path: isLatest ? 'welcome' : 'stale', title: isLatest ? 'Needle result' : 'Alpha result', locale: 'en', status: 'published', author: { id: null, displayName: null }, frontmatter: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', links: { self: '', byPath: '', revisions: '', drafts: '' } },
              excerpt: isLatest
                ? '…needle highlighted with useful nearby text…'
                : 'Stale excerpt',
              score: 1,
              relevanceScore: isLatest ? 0.82 : 0.2,
              matchSources: ['keyword'],
            }],
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/');
    const search = page.getByLabel('Search wiki pages');
    await search.fill('al');
    await search.fill('needle');
    const results = page.getByTestId('header-search-results');
    await expect(results.getByRole('link', { name: /Needle result/ })).toBeVisible();
    await expect(results.locator('mark', { hasText: 'Needle' }).first()).toBeVisible();
    await expect(results.locator('mark', { hasText: 'needle' }).first()).toBeVisible();
    await expect(results.getByText('82%')).toBeVisible();
    await expect(results.getByText(/highlighted with useful nearby text/)).toBeVisible();
    await expect(results.getByRole('link', { name: /Alpha result/ })).toBeHidden();
    await results.getByRole('link', { name: /Needle result/ }).click();
    await expect.poll(() => resultOpenEvents).toHaveLength(1);
  });

  test('shows stable results and progress while semantic polling continues', async ({ page }) => {
    let queryCalls = 0;
    await page.route('**/api/v1/search/pages', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as { kind?: string; q?: string };
      if (body.kind === 'query') {
        queryCalls += 1;
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            searchRecordId: '11111111-1111-4111-8111-111111111111',
            semanticState: queryCalls === 1 ? 'pending' : 'ready',
            items: [{
              page: { id: '22222222-2222-4222-8222-222222222222', path: 'books/reading', title: 'Reading result', locale: 'en', status: 'published', author: { id: null, displayName: null }, frontmatter: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', links: { self: '', byPath: '', revisions: '', drafts: '' } },
              excerpt: 'Reading result excerpt',
              score: 1,
              relevanceScore: 0.9,
              matchSources: ['keyword'],
            }],
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/');
    const search = page.getByLabel('Search wiki pages');
    await search.fill('re');
    const results = page.getByTestId('header-search-results');
    await expect(results.getByRole('link', { name: /Reading result/ })).toBeVisible();
    await expect(page.getByText('Press Escape to close search.')).toBeVisible();
    await expect(page.getByText('Searching…')).toBeHidden();
    await expect(page.getByTestId('header-search-progress')).toBeVisible();
    await expect.poll(() => queryCalls).toBeGreaterThan(1);
    await expect(page.getByTestId('header-search-progress')).toBeHidden();
  });
});
