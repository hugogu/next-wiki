import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  login,
  createApiKey,
  createAndPublishChinesePage,
  createAndPublishImagePage,
  createGitServer,
  createStaticFileServer,
  configureAndPublish,
  cloneBranch,
  blockWikiRequests,
} from './static-site-helpers';

test.describe('static site artifact', () => {
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
    const key = await createApiKey(setupPage, `Static site artifact ${Date.now()}`, ['View', 'Create', 'Edit']);
    await createAndPublishChinesePage(setupPage, key);
    await createAndPublishImagePage(setupPage, key);
    await configureAndPublish(setupPage, gitServer.url, staticServer.url);
    await cloneBranch(gitServer.bareRepoPath, 'gh-pages', '/tmp/static-site-artifact-root');
    staticServer.setRoot('/tmp/static-site-artifact-root');
  });

  test.afterAll(async () => {
    await setupPage?.close();
    await setupContext?.close();
    await staticServer?.close();
    await gitServer?.close();
  });

  test('T054: navigation, anchor jumps, dark mode, code, math, diagrams and images render with the wiki unreachable', async ({ browser, baseURL }) => {
    const staticPage = await browser.newPage();
    await blockWikiRequests(staticPage, baseURL!);

    // Force dark mode for a deterministic initial state.
    await staticPage.goto(staticServer.url);
    await staticPage.evaluate(() => localStorage.setItem('next-wiki-theme', 'dark'));
    await staticPage.reload();

    await expect(staticPage.getByRole('link', { name: /Welcome to next-wiki/i })).toBeVisible();

    await staticPage.getByRole('link', { name: /Welcome to next-wiki/i }).click();
    await expect(staticPage.getByRole('heading', { name: /What you can do/i })).toBeVisible();

    await staticPage.getByRole('link', { name: /What you can do/i }).first().click();
    await expect(staticPage).toHaveURL(/#what-you-can-do$/);
    await expect(staticPage.locator('#what-you-can-do')).toBeVisible();

    await expect(staticPage.locator('[data-code-block]')).toHaveCount(2);
    await expect(staticPage.locator('[data-mermaid-block]')).toHaveCount(1);
    await expect(staticPage.locator('.katex').first()).toBeVisible();
    await expect(staticPage.locator('[data-mermaid-block] svg.flowchart')).toBeVisible({ timeout: 10_000 });

    await expect(staticPage.locator('html')).toHaveClass(/dark/);
    const toggle = staticPage.getByRole('button', { name: /Toggle light and dark appearance/i });
    await toggle.click();
    await staticPage.waitForTimeout(300);
    await toggle.click();
    await staticPage.waitForTimeout(300);
    await expect(staticPage.locator('html')).not.toHaveClass(/dark/);

    await staticPage.goto(`${staticServer.url}image-demo/`);
    await expect(staticPage.locator('html')).not.toHaveClass(/dark/);

    await expect(staticPage.locator('img')).toBeVisible();
    const imgSrc = await staticPage.locator('img').getAttribute('src');
    expect(imgSrc).toContain('_assets/');
    const imgResp = await staticPage.request.get(`${staticServer.url}${imgSrc!.replace(/^\//, '')}`);
    expect(imgResp.status()).toBe(200);

    await staticPage.close();
  });

  test('T061: Chinese search works with the wiki unreachable', async ({ browser, baseURL }) => {
    const staticPage = await browser.newPage();
    await blockWikiRequests(staticPage, baseURL!);

    await staticPage.goto(staticServer.url);
    const search = staticPage.getByPlaceholder(/Search this site/i);
    await search.fill('北京烤鸭');
    await search.click();

    await expect(staticPage.getByRole('link', { name: /中文搜索示例/i })).toBeVisible({ timeout: 15_000 });
    await staticPage.getByRole('link', { name: /中文搜索示例/i }).click();
    await expect(staticPage.getByRole('heading', { name: /中文搜索示例/i })).toBeVisible();

    await staticPage.close();
  });

  test('T068: language switching and the missing-translation path', async ({ browser, baseURL }) => {
    const staticPage = await browser.newPage();
    await blockWikiRequests(staticPage, baseURL!);

    await staticPage.goto(`${staticServer.url}welcome/`);

    await staticPage.getByRole('link', { name: 'ZH' }).click();
    await expect(staticPage).toHaveURL(/\/zh\/$/);

    await expect(staticPage.getByRole('link', { name: /中文搜索示例/i })).toBeVisible();
    await staticPage.getByRole('link', { name: /中文搜索示例/i }).click();
    await expect(staticPage.getByRole('heading', { name: /中文搜索示例/i })).toBeVisible();

    await staticPage.getByRole('link', { name: 'EN' }).click();
    await expect(staticPage).toHaveURL(/\/$/);
    await expect(staticPage.getByRole('link', { name: /Welcome to next-wiki/i })).toBeVisible();

    await staticPage.close();
  });
});
