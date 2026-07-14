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
  const initialContent = [
    '# Initial heading',
    '',
    'Unchanged 1',
    '',
    'Unchanged 2',
    '',
    'Unchanged 3',
    '',
    'Unchanged 4',
    '',
    'Unchanged 5',
    '',
    'Unchanged 6',
    '',
    'Unchanged 7',
    '',
    'Unchanged 8',
  ].join('\n');
  const changedContent = initialContent.replace('Unchanged 5', 'Changed body');
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
  await page.locator('.cm-content').fill(initialContent);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(`/history/${path}`);

  await page.goto(`/edit/${path}`);
  await page.locator('.cm-content').fill(changedContent);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(`/history/${path}`);

  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Compare' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Publish this revision' }).first()).toHaveClass(
    /h-8/,
  );
  await page.getByRole('button', { name: /Version 2/ }).click();
  await page.waitForURL(`/history/${path}?selected=2`);
  await expect(page.getByText('Initial heading')).toBeVisible();
  await page.getByRole('button', { name: /Version 3/ }).click();
  await page.waitForURL(`/history/${path}?compare=2..3`);
  await expect(page.getByText('Comparing v2 to v3')).toBeVisible();
  await expect(page.getByLabel('Later revision source')).toContainText('Changed body');
  await expect(page.getByLabel('Later revision source')).not.toContainText('Initial heading');
  const changedRow = page
    .getByLabel('Later revision source')
    .locator('[data-diff-kind="changed"]')
    .first();
  await expect(changedRow).toBeVisible();
  expect(
    await changedRow.evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe('rgba(0, 0, 0, 0)');

  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByRole('group', { name: 'Source / Preview' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('Later revision preview')).toContainText('Changed body');
  const changedPreviewBlock = page
    .getByLabel('Later revision preview')
    .locator('[data-diff-kind="changed"]')
    .first();
  await expect(changedPreviewBlock).toBeVisible();
  expect(
    await changedPreviewBlock.evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe('rgba(0, 0, 0, 0)');
  await page.goto(`/revisions/3..2/${path}`);
  await page.waitForURL(`/history/${path}?compare=2..3`);
  expect(diffRequests).toEqual([]);
});
