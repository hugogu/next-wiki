import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { createApiKey, createPublishedPage, login } from './static-site-helpers';

/**
 * The reader's right-hand Outline sidebar can be folded away to a thin rail at
 * the page edge, which gives the article the room, and the browser remembers the
 * choice: every other page opens the way this one was left.
 *
 * Everything below is done as an anonymous reader. Public pages are cached static
 * documents that are the same for everyone, so the choice lives in the reader's
 * own browser, is applied by a small script in <head> before the first paint, and
 * is carried out by the stylesheet.
 */

const STORAGE_KEY = 'next-wiki-outline-collapsed';
const ATTRIBUTE = 'data-outline-collapsed';

const stamp = Date.now();
const pageA = { path: `outline-collapse-a-${stamp}`, title: `Outline collapse A ${stamp}` };
const pageB = { path: `outline-collapse-b-${stamp}`, title: `Outline collapse B ${stamp}` };

const source = (title: string) =>
  `# ${title}\n\nIntroduction.\n\n## First section\n\nText.\n\n### A detail\n\nText.\n\n## Second section\n\nText.\n`;

test.describe('collapsing the reader outline sidebar', () => {
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
  const article = (page: Page) => page.getByTestId('page-reader-article');
  const html = (page: Page) => page.locator('html');
  const savedChoice = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  const widthOf = async (locator: Locator) => Math.round((await locator.boundingBox())!.width);

  /**
   * The buttons are in the delivered HTML before React has attached their click
   * handlers, so a click straight after load can go nowhere. React marks an
   * element it controls with a `__reactProps$…` key; wait for that.
   */
  const waitUntilInteractive = (page: Page) =>
    page.waitForFunction(() => {
      const button = document.querySelector('aside[aria-label="Outline"] button');
      return !!button && Object.keys(button).some((key) => key.startsWith('__reactProps$'));
    });

  async function readerContext(browser: Browser): Promise<BrowserContext> {
    // The sidebar only shows from the xl breakpoint up. This is wide enough for it, and narrow
    // enough that the article is the column's width rather than its own maximum, so the room
    // the sidebar gives back can be seen.
    return browser.newContext({ viewport: { width: 1300, height: 900 } });
  }

  async function open(page: Page, target: { path: string }) {
    await page.goto(`/wiki/${target.path}`);
    await expect(outline(page)).toBeVisible();
    await waitUntilInteractive(page);
  }

  /** What the page looks like with the sidebar folded away. */
  async function expectCollapsed(page: Page) {
    await expect(html(page)).toHaveAttribute(ATTRIBUTE, '');
    await expect(expandButton(page)).toBeVisible();
    await expect(collapseButton(page)).toHaveCount(0);
    await expect(sectionLink(page)).toBeHidden();
    expect(await widthOf(outline(page))).toBeLessThan(64);
  }

  /** What the page looks like with the sidebar open. */
  async function expectExpanded(page: Page) {
    await expect(html(page)).not.toHaveAttribute(ATTRIBUTE, '');
    await expect(collapseButton(page)).toBeVisible();
    await expect(expandButton(page)).toHaveCount(0);
    await expect(sectionLink(page)).toBeVisible();
    expect(await widthOf(outline(page))).toBe(288);
  }

  test('folds the whole sidebar into a rail at the right edge and gives the article the room', async ({ browser }) => {
    const reader = await (await readerContext(browser)).newPage();
    await open(reader, pageA);
    await expectExpanded(reader);
    const articleBefore = await widthOf(article(reader));

    await collapseButton(reader).click();
    await expectCollapsed(reader);
    expect(await widthOf(article(reader))).toBeGreaterThan(articleBefore);
    // The button that was pressed is gone, so keyboard focus moves to the one that replaces it.
    await expect(expandButton(reader)).toBeFocused();

    await expandButton(reader).click();
    await expectExpanded(reader);
    expect(await widthOf(article(reader))).toBe(articleBefore);
    await expect(collapseButton(reader)).toBeFocused();
  });

  test('can be folded away and back from the keyboard', async ({ browser }) => {
    const reader = await (await readerContext(browser)).newPage();
    await open(reader, pageA);

    await collapseButton(reader).focus();
    await reader.keyboard.press('Enter');
    await expectCollapsed(reader);
    await expect(expandButton(reader)).toBeFocused();

    await reader.keyboard.press('Enter');
    await expectExpanded(reader);
    await expect(collapseButton(reader)).toBeFocused();
  });

  test('remembers the choice across a reload and on another page', async ({ browser }) => {
    test.setTimeout(90_000);
    const reader = await (await readerContext(browser)).newPage();
    await open(reader, pageA);

    await collapseButton(reader).click();
    await expectCollapsed(reader);
    expect(await savedChoice(reader)).toBe('true');

    await reader.reload();
    await expectCollapsed(reader);

    await open(reader, pageB);
    await expectCollapsed(reader);

    await expandButton(reader).click();
    await expectExpanded(reader);
    expect(await savedChoice(reader)).toBeNull();

    await open(reader, pageA);
    await expectExpanded(reader);
  });

  test('keeps the choice when a page is opened by following a link inside the app', async ({ browser }) => {
    test.setTimeout(90_000);
    const reader = await (await readerContext(browser)).newPage();
    await open(reader, pageA);
    await collapseButton(reader).click();
    await expectCollapsed(reader);

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
    await expectCollapsed(reader);
  });

  test('follows a choice made in another tab', async ({ browser }) => {
    const context = await readerContext(browser);
    const first = await context.newPage();
    const second = await context.newPage();
    await open(first, pageA);
    await open(second, pageB);

    await collapseButton(second).click();
    await expectCollapsed(second);
    await expectCollapsed(first);

    await expandButton(first).click();
    await expectExpanded(first);
    await expectExpanded(second);
  });

  test('is a choice of this browser only: the delivered page and other browsers stay open', async ({ browser }) => {
    const folded = await readerContext(browser);
    const reader = await folded.newPage();
    await open(reader, pageA);
    await collapseButton(reader).click();
    await expectCollapsed(reader);

    // The page as delivered is the same for everyone: it carries both buttons, the script that
    // applies a saved choice, and nothing about this reader.
    const delivered = await (await reader.request.get(`/wiki/${pageA.path}`)).text();
    expect(delivered).toContain('aria-label="Collapse outline"');
    expect(delivered).toContain('aria-label="Expand outline"');
    expect(delivered).toContain(STORAGE_KEY);
    expect(delivered).not.toMatch(new RegExp(`<html[^>]*${ATTRIBUTE}`));

    const other = await (await readerContext(browser)).newPage();
    await open(other, pageA);
    await expectExpanded(other);
  });
});
