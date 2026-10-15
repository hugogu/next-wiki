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
  await page.waitForURL(`/h/${path}?compare=1..2`);

  await page.goto(`/edit/${path}`);
  await page.locator('.cm-content').fill(changedContent);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(`/h/${path}?compare=2..3`);

  // Opening History with no comparison in the URL lands on the two newest
  // revisions, rather than an empty "select two revisions" pane.
  await page.goto(`/h/${path}`);
  await expect(page.getByText('Comparing v2 to v3')).toBeVisible();

  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Compare' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Publish this revision' }).first()).toHaveClass(
    /h-8/,
  );
  // Deselect v3 from the default pair, leaving v2 alone, so the manual
  // click-to-select flow below still starts from a single selection.
  await page.getByRole('button', { name: /Version 3/ }).click();
  await page.waitForURL(`/h/${path}?selected=2`);
  await expect(page.getByText('Initial heading')).toBeVisible();
  await page.getByRole('button', { name: /Version 3/ }).click();
  await page.waitForURL(`/h/${path}?compare=2..3`);
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
  await page.goto(`/h/${path}?compare=2..3`);
  await expect(page).toHaveURL(`/h/${path}?compare=2..3`);
  expect(diffRequests).toEqual([]);

  await page.getByRole('button', { name: 'Publish this revision' }).first().click();
  await page.waitForURL(`/wiki/${path}`);
  await page.context().clearCookies();
  await page.goto(`/h/${path}`);
  await expect(page.getByRole('heading', { name: /^Version history:/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Version 3' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Version 2' })).toHaveCount(0);
});

test('picks versions in the page: the highlight moves at once and revisions load on demand', async ({ page }) => {
  const path = `history-picking-${Date.now()}`;
  await login(page);
  const create = await page.request.post('/api/v1/pages', {
    data: { path, title: 'History picking', contentSource: 'Body of version one' },
  });
  expect(create.status()).toBe(201);
  const { id } = (await create.json()) as { id: string };
  for (const word of ['two', 'three', 'four']) {
    const draft = await page.request.post(`/api/v1/pages/${id}/drafts`, {
      data: { title: 'History picking', contentSource: `Body of version ${word}` },
    });
    expect(draft.status()).toBe(201);
  }

  // A pick used to be a navigation that re-ran the History page on the server;
  // now it is only a request for the revision that is not on the page yet.
  const historyRenders: string[] = [];
  const revisionLoads: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/h/') && url.searchParams.has('_rsc')) historyRenders.push(url.pathname);
    if (/^\/api\/pages\/[^/]+\/revisions\/\d+$/.test(url.pathname)) revisionLoads.push(url.pathname);
  });

  await page.goto(`/h/${path}`);
  await expect(page.getByText('Comparing v3 to v4')).toBeVisible();
  // The version buttons only work once React has hydrated them.
  await page.waitForFunction(() => {
    const button = document.querySelector('ul button[aria-pressed]');
    return !!button && Object.keys(button).some((key) => key.startsWith('__reactProps$'));
  });

  await page.getByRole('button', { name: /Version 1/ }).click();
  await expect(page.getByRole('button', { name: /Version 1/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Body of version one')).toBeVisible();
  await expect(page).toHaveURL(`/h/${path}?selected=1`);

  await page.getByRole('button', { name: /Version 2/ }).click();
  await expect(page.getByText('Comparing v1 to v2')).toBeVisible();
  await expect(page).toHaveURL(`/h/${path}?compare=1..2`);

  // Source/Preview is a display option: it changes the address, not the data.
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByLabel('Later revision preview')).toContainText('Body of version two');
  await expect(page).toHaveURL(`/h/${path}?compare=1..2&view=preview`);

  // Versions 3 and 4 came with the page; only 1 and 2 had to be fetched, once each.
  await page.getByRole('button', { name: /Version 4/ }).click();
  await expect(page.getByText('Body of version four')).toBeVisible();
  expect(revisionLoads).toEqual([`/api/pages/${id}/revisions/1`, `/api/pages/${id}/revisions/2`]);
  expect(historyRenders).toEqual([]);

  // The address is a complete description of the view: a reload shows the same thing.
  await page.goto(`/h/${path}?compare=1..2&view=preview`);
  await expect(page.getByText('Comparing v1 to v2')).toBeVisible();
  await expect(page.getByLabel('Earlier revision preview')).toContainText('Body of version one');
});
