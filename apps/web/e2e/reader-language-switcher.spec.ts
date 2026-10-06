import { test, expect, type Page } from '@playwright/test';
import {
  createApiKey,
  createPublishedPage,
  insertPublishedTranslation,
  login,
} from './static-site-helpers';

/**
 * 043: switching between a page and its translations is a button in the toolbar,
 * and the language a reader picks is remembered. Opening a page that has a
 * version in that language shows it; a page without one opens as written.
 *
 * Everything below is done as an anonymous reader: reading in another language
 * needs no account, and the choice lives in the reader's own browser.
 */

const STORAGE_KEY = 'next-wiki-reading-language';

const stamp = Date.now();
const withEnglish = { path: `lang-switch-a-${stamp}`, title: 'Language switch A' };
const withoutEnglish = { path: `lang-switch-b-${stamp}`, title: 'Language switch B' };

const ORIGINAL_A = 'The original text of page A.';
const ENGLISH_A = 'The English text of page A.';
const ORIGINAL_B = 'The original text of page B, which has no translation.';

test.describe('the reader language switcher', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext();
    const author = await context.newPage();
    await login(author);
    const key = await createApiKey(author, `Language switcher ${stamp}`, ['View', 'Create', 'Edit']);
    const a = await createPublishedPage(author, key, {
      ...withEnglish,
      contentSource: `# ${withEnglish.title}\n\n${ORIGINAL_A}`,
    });
    await createPublishedPage(author, key, {
      ...withoutEnglish,
      contentSource: `# ${withoutEnglish.title}\n\n${ORIGINAL_B}`,
    });
    await insertPublishedTranslation(a.id, {
      locale: 'en',
      title: 'Language switch A in English',
      content: `# Language switch A in English\n\n${ENGLISH_A}`,
    });
    await context.close();
  });

  const languageButton = (page: Page) => page.getByRole('button', { name: 'Language', exact: true });
  const storedChoice = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);

  /** The menu is a hover/focus dropdown, so it has to be opened before its links can be used. */
  async function pick(page: Page, label: string) {
    await languageButton(page).hover();
    await page.getByRole('link', { name: label, exact: true }).click();
  }

  test('offers the original and the translation from a button in the toolbar', async ({ browser }) => {
    const reader = await (await browser.newContext()).newPage();
    await reader.goto(`/wiki/${withEnglish.path}`);
    await expect(reader.getByText(ORIGINAL_A)).toBeVisible();

    await languageButton(reader).hover();
    await expect(reader.getByRole('link', { name: 'Original', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(reader.getByRole('link', { name: 'English', exact: true })).toHaveAttribute(
      'href',
      `/wiki/en/${withEnglish.path}`,
    );

    // It is not an entry at the end of the actions menu any more.
    await expect(reader.getByText('Other language versions')).toHaveCount(0);

    // A page with no translation has no such button.
    await reader.goto(`/wiki/${withoutEnglish.path}`);
    await expect(reader.getByText(ORIGINAL_B)).toBeVisible();
    await expect(languageButton(reader)).toHaveCount(0);
  });

  test('remembers the language, applies it to the next page that has it, and respects Back', async ({ browser }) => {
    test.setTimeout(90_000);
    const reader = await (await browser.newContext()).newPage();

    await reader.goto(`/wiki/${withEnglish.path}`);
    await pick(reader, 'English');
    await expect(reader).toHaveURL(`/wiki/en/${withEnglish.path}`);
    await expect(reader.getByText(ENGLISH_A)).toBeVisible();
    expect(await storedChoice(reader)).toBe('en');

    // A page without an English version falls back to the original.
    await reader.goto(`/wiki/${withoutEnglish.path}`);
    await expect(reader.getByText(ORIGINAL_B)).toBeVisible();
    await expect(reader).toHaveURL(`/wiki/${withoutEnglish.path}`);

    // Opening the first page again picks the remembered language by itself.
    await reader.goto(`/wiki/${withEnglish.path}`);
    await expect(reader).toHaveURL(`/wiki/en/${withEnglish.path}`);
    await expect(reader.getByText(ENGLISH_A)).toBeVisible();

    // The switch replaced the entry for the page that redirected, so Back goes
    // to the page before it instead of bouncing straight forward again.
    await reader.goBack();
    await expect(reader).toHaveURL(`/wiki/${withoutEnglish.path}`);
    await expect(reader.getByText(ORIGINAL_B)).toBeVisible();
  });

  test('keeps the original too when that is what was chosen', async ({ browser }) => {
    test.setTimeout(90_000);
    const reader = await (await browser.newContext()).newPage();

    await reader.goto(`/wiki/${withEnglish.path}`);
    await pick(reader, 'English');
    await expect(reader).toHaveURL(`/wiki/en/${withEnglish.path}`);

    await pick(reader, 'Original');
    await expect(reader).toHaveURL(`/wiki/${withEnglish.path}`);
    await expect(reader.getByText(ORIGINAL_A)).toBeVisible();
    expect(await storedChoice(reader)).toBeNull();

    // Open it afresh. A switch, if there were going to be one, happens right
    // after the page hydrates, so give it that moment before saying there was none.
    await reader.goto(`/wiki/${withEnglish.path}`);
    await expect(reader.getByText(ORIGINAL_A)).toBeVisible();
    await languageButton(reader).waitFor();
    await reader.waitForTimeout(750);
    await expect(reader).toHaveURL(`/wiki/${withEnglish.path}`);
  });

  test('does not move a reader who opens a language directly', async ({ browser }) => {
    const reader = await (await browser.newContext()).newPage();
    await reader.goto(`/wiki/en/${withEnglish.path}`);
    await expect(reader.getByText(ENGLISH_A)).toBeVisible();

    await languageButton(reader).hover();
    await expect(reader.getByRole('link', { name: 'English', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(reader).toHaveURL(`/wiki/en/${withEnglish.path}`);
  });
});
