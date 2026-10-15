import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createApiKey, createPublishedPage, login } from './static-site-helpers';

/**
 * The reader's Outline can be folded away from a button in its header, and the
 * browser remembers the choice: the next page opens the way this one was left.
 *
 * Everything below is done as an anonymous reader. Public pages are cached
 * static documents that are the same for everyone, so the choice lives in the
 * reader's own browser and is applied once the page has loaded.
 */

const STORAGE_KEY = 'next-wiki-outline';

const stamp = Date.now();
const pageA = { path: `outline-collapse-a-${stamp}`, title: `Outline collapse A ${stamp}` };
const pageB = { path: `outline-collapse-b-${stamp}`, title: `Outline collapse B ${stamp}` };

const source = (title: string) =>
  `# ${title}\n\nIntroduction.\n\n## First section\n\nText.\n\n### A detail\n\nText.\n\n## Second section\n\nText.\n`;

test.describe('collapsing the reader outline', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext();
    const author = await context.newPage();
    await login(author);
    const key = await createApiKey(author, `Outline collapse ${stamp}`, ['View', 'Create', 'Edit']);
    for (const page of [pageA, pageB]) {
      await createPublishedPage(author, key, { ...page, contentSource: source(page.title) });
    }
    await context.close();
  });

  const outline = (page: Page) => page.getByRole('complementary', { name: 'Outline' });
  const collapseButton = (page: Page) => outline(page).getByRole('button', { name: 'Collapse outline' });
  const expandButton = (page: Page) => outline(page).getByRole('button', { name: 'Expand outline' });
  const sectionLink = (page: Page) => outline(page).getByRole('link', { name: 'First section' });
  const savedChoice = (page: Page) =>
    page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      return raw === null ? null : (JSON.parse(raw) as { state: { collapsed: boolean } }).state.collapsed;
    }, STORAGE_KEY);

  /**
   * The button is in the delivered HTML before React has attached its click
   * handler, so a click straight after load can go nowhere. React marks an
   * element it controls with a `__reactProps$…` key; wait for that.
   */
  const waitUntilInteractive = (page: Page) =>
    page.waitForFunction(() => {
      const button = document.querySelector('aside[aria-label="Outline"] button');
      return !!button && Object.keys(button).some((key) => key.startsWith('__reactProps$'));
    });

  async function readerContext(browser: Browser): Promise<BrowserContext> {
    // The Outline lives in a sidebar that only shows from the xl breakpoint up.
    return browser.newContext({ viewport: { width: 1440, height: 900 } });
  }

  async function open(page: Page, target: { path: string }) {
    await page.goto(`/wiki/${target.path}`);
    await expect(outline(page)).toBeVisible();
    await waitUntilInteractive(page);
  }

  test('folds the list away and back from a button in the outline header', async ({ browser }) => {
    const reader = await (await readerContext(browser)).newPage();
    await open(reader, pageA);

    await expect(sectionLink(reader)).toBeVisible();
    await expect(collapseButton(reader)).toHaveAttribute('aria-expanded', 'true');

    await collapseButton(reader).click();
    await expect(sectionLink(reader)).toBeHidden();
    await expect(outline(reader).getByText('Outline', { exact: true })).toBeVisible();
    await expect(expandButton(reader)).toHaveAttribute('aria-expanded', 'false');

    await expandButton(reader).click();
    await expect(sectionLink(reader)).toBeVisible();
    await expect(collapseButton(reader)).toHaveAttribute('aria-expanded', 'true');
  });

  test('remembers the choice across a reload and a fresh visit to another page', async ({ browser }) => {
    test.setTimeout(90_000);
    const reader = await (await readerContext(browser)).newPage();
    await open(reader, pageA);

    await collapseButton(reader).click();
    await expect(expandButton(reader)).toBeVisible();
    expect(await savedChoice(reader)).toBe(true);

    // The delivered page has the list open; the saved choice is applied once it has loaded.
    await reader.reload();
    await expect(expandButton(reader)).toBeVisible();
    await expect(sectionLink(reader)).toBeHidden();

    await open(reader, pageB);
    await expect(expandButton(reader)).toBeVisible();
    await expect(sectionLink(reader)).toBeHidden();

    await expandButton(reader).click();
    await expect(collapseButton(reader)).toBeVisible();
    expect(await savedChoice(reader)).toBe(false);

    await reader.goto(`/wiki/${pageA.path}`);
    await expect(collapseButton(reader)).toBeVisible();
    await expect(sectionLink(reader)).toBeVisible();
  });

  test('applies the choice to a page opened by following a link inside the app', async ({ browser }) => {
    test.setTimeout(90_000);
    const reader = await (await readerContext(browser)).newPage();
    await open(reader, pageA);
    await collapseButton(reader).click();
    await expect(expandButton(reader)).toBeVisible();

    // A client-side navigation keeps the document, so this marker survives it
    // and a full page load would lose it.
    await reader.evaluate(() => {
      (window as unknown as { sameDocument: boolean }).sameDocument = true;
    });
    await reader.getByRole('link', { name: pageB.title }).first().click();
    await expect(reader).toHaveURL(`/wiki/${pageB.path}`);

    expect(
      await reader.evaluate(() => (window as unknown as { sameDocument?: boolean }).sameDocument),
    ).toBe(true);
    await expect(expandButton(reader)).toBeVisible();
    await expect(sectionLink(reader)).toBeHidden();
  });

  test('follows a choice made in another tab', async ({ browser }) => {
    const context = await readerContext(browser);
    const first = await context.newPage();
    const second = await context.newPage();
    await open(first, pageA);
    await open(second, pageB);

    await collapseButton(second).click();
    await expect(expandButton(second)).toBeVisible();
    await expect(expandButton(first)).toBeVisible();
    await expect(sectionLink(first)).toBeHidden();

    await expandButton(first).click();
    await expect(collapseButton(second)).toBeVisible();
    await expect(sectionLink(second)).toBeVisible();
  });

  test('is a choice of this browser only: the delivered page and other browsers stay open', async ({ browser }) => {
    const folded = await readerContext(browser);
    const reader = await folded.newPage();
    await open(reader, pageA);
    await collapseButton(reader).click();
    await expect(expandButton(reader)).toBeVisible();

    // The page as delivered is the same for everyone: open, with nothing about this reader in it.
    const delivered = await (await reader.request.get(`/wiki/${pageA.path}`)).text();
    expect(delivered).toContain('aria-label="Collapse outline"');
    expect(delivered).not.toContain('aria-label="Expand outline"');

    const other = await (await readerContext(browser)).newPage();
    await open(other, pageA);
    await expect(collapseButton(other)).toBeVisible();
    await expect(sectionLink(other)).toBeVisible();
  });
});
