import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  login,
  createGitServer,
  createStaticFileServer,
  configureAndPublish,
  waitForStaticSiteRun,
  cloneBranch,
} from './static-site-helpers';

test.describe('static site publish', () => {
  test.describe.configure({ mode: 'serial' });

  let setupContext: BrowserContext;
  let setupPage: Page;
  let gitServer: Awaited<ReturnType<typeof createGitServer>>;
  let staticServer: Awaited<ReturnType<typeof createStaticFileServer>>;

  test.beforeAll(async ({ browser }) => {
    setupContext = await browser.newContext();
    setupPage = await setupContext.newPage();
    [gitServer, staticServer] = await Promise.all([createGitServer(), createStaticFileServer()]);
    await login(setupPage);
    await configureAndPublish(setupPage, gitServer.url, staticServer.url);
  });

  test.afterAll(async () => {
    await setupPage?.close();
    await setupContext?.close();
    await staticServer?.close();
    await gitServer?.close();
  });

  test('T036: configure → publish → status reaches succeeded with counts shown', async () => {
    await setupPage.goto('/admin/static-site');

    await expect(setupPage.getByText('Published', { exact: true })).toBeVisible();
    await expect(setupPage.getByText(/\d+ pages, \d+ assets published, \d+ excluded\./)).toBeVisible();
    await expect(setupPage.getByRole('link', { name: /View public site/i })).toBeVisible();

    const run = await setupPage.request.get('/api/static-site/publications?limit=1');
    expect(run.status()).toBe(200);
    const { items } = (await run.json()) as {
      items: Array<{ status: string; pagesPublished: number; assetsPublished: number; pagesExcluded: number }>;
    };
    const last = items[0];
    if (!last) throw new Error('No static site run found');
    expect(last.status).toBe('succeeded');
    expect(last.pagesPublished).toBeGreaterThan(0);
    expect(last.pagesExcluded).toBeGreaterThanOrEqual(0);
  });

  test('T081: takedown removes the published site', async ({ browser }) => {
    await cloneBranch(gitServer.bareRepoPath, 'gh-pages', '/tmp/static-site-publish-takedown');
    staticServer.setRoot('/tmp/static-site-publish-takedown');

    const staticPage = await browser.newPage();
    await staticPage.goto(staticServer.url);
    await expect(staticPage.getByRole('link', { name: /Welcome to next-wiki/i })).toBeVisible();

    await setupPage.goto('/admin/static-site');
    await setupPage.getByRole('button', { name: /Remove public site/i }).click();
    await setupPage.getByPlaceholder('gh-pages').fill('gh-pages');
    await setupPage.getByRole('button', { name: /Remove the site/i }).click();
    await expect(setupPage.getByText('Takedown queued')).toBeVisible();
    await waitForStaticSiteRun(setupPage);

    await setupPage.goto('/admin/static-site');
    await expect(setupPage.getByText('Disabled').first()).toBeVisible();

    await cloneBranch(gitServer.bareRepoPath, 'gh-pages', '/tmp/static-site-publish-takedown-empty');
    staticServer.setRoot('/tmp/static-site-publish-takedown-empty');

    await staticPage.goto(`${staticServer.url}welcome/`);
    await expect(staticPage.getByText(/not found/i)).toBeVisible();
    await staticPage.close();
  });
});
