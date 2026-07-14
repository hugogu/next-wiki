import { expect, test, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.locator('main').getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/');
}

test('compares two revisions without requesting a server diff endpoint', async ({ page }) => {
  const path = `revision-diff-${Date.now()}`;
  const diffRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/v1\/pages\/[^/]+\/revisions\/\d+\/diff(?:\?|$)/.test(request.url())) {
      diffRequests.push(request.url());
    }
  });
  await login(page);

  await page.goto('/new');
  await page.getByLabel('Title').fill('Revision Diff');
  await page.getByLabel('Path').fill(path);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(`/edit/${path}`);
  await page.locator('.cm-content').fill('# Changed heading\n\nChanged body');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(`/history/${path}`);

  await page.getByLabel('Version 1').check();
  await page.getByLabel('Version 2').check();
  await page.getByRole('button', { name: 'Compare' }).click();
  await page.waitForURL(`/revisions/1..2/${path}`);
  await expect(page.getByRole('heading', { name: 'Revision comparison' })).toBeVisible();
  await expect(page.getByLabel('Later revision source')).toContainText('Changed heading');

  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByLabel('Later revision preview')).toContainText('Changed heading');
  expect(diffRequests).toEqual([]);
});
