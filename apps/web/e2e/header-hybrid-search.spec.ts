import { expect, test } from '@playwright/test';

test.describe('Header hybrid page search', () => {
  test('opens after focus, waits for two characters, and navigates through a canonical result link', async ({ page }) => {
    await page.goto('/');
    const search = page.getByLabel('Search wiki pages');
    await search.focus();
    await expect(page.getByText('Type at least two characters to search.')).toBeVisible();

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
    const welcome = page.getByRole('link', { name: /Welcome to next-wiki/ });
    await expect(welcome).toBeVisible();
    await Promise.all([page.waitForURL('/welcome'), welcome.click()]);
  });

  test('Escape closes search once without changing the current URL', async ({ page }) => {
    await page.goto('/');
    const search = page.getByLabel('Search wiki pages');
    await search.focus();
    await search.fill('We');
    await page.waitForResponse((candidate) => candidate.url().includes('/api/v1/search/pages') && candidate.request().method() === 'POST');

    let escapeEvents = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/search/pages') && request.method() === 'POST' && request.postData()?.includes('"action":"escape"')) {
        escapeEvents += 1;
      }
    });
    await page.keyboard.press('Escape');
    await expect(page.getByText('Type at least two characters to search.')).toBeHidden();
    await expect(page).toHaveURL('/');
    await page.waitForTimeout(100);
    expect(escapeEvents).toBe(1);
  });
});
