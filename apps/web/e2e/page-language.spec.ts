import { test, expect, type Locator, type Page } from '@playwright/test';
import { clickSignInSubmit } from './test-helpers';

/**
 * 042: a page's language is optional, and whoever can edit the page can set,
 * change and clear it. A page nobody has given a language can be translated
 * into English; one recorded in English cannot — and the translation dialog
 * that refuses it lets the language be corrected on the spot.
 */

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await clickSignInSubmit(page);
  await page.waitForURL('/');
}

function fillEditor(page: Page, content: string) {
  return page.locator('.cm-content').fill(content);
}

async function createPage(page: Page, path: string, title: string) {
  await page.goto('/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Path').fill(path);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(`/edit/${path}`);
}

async function publishPage(page: Page, path: string) {
  await page.getByRole('button', { name: /publish this revision/i }).first().click();
  await page.waitForURL(`/wiki/${path}`);
}

/** A published page with no language, open in the reader. */
async function createPublishedPage(page: Page, path: string, title: string) {
  await createPage(page, path, title);
  await fillEditor(page, `# ${title}\n\nLanguage test content.`);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(`/h/${path}?compare=1..2`);
  await publishPage(page, path);
  await expect(page).toHaveURL(`/wiki/${path}`);
}

async function openPageSettings(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'More actions' }).hover();
  await page.getByRole('button', { name: 'Page settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Page properties' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openTranslateDialog(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'More actions' }).hover();
  await page.getByRole('button', { name: 'Translate this page' }).click();
  const dialog = page.getByRole('dialog', { name: 'Translate this page' });
  await expect(dialog).toBeVisible();
  return dialog;
}

const languageField = (dialog: Locator) => dialog.getByLabel('Language', { exact: true });

// Whether a language can be picked is the <option>'s own `disabled` property:
// Playwright's toBeDisabled()/toBeEnabled() do not look at options, so they
// would pass whatever the option said.

/** Save the open properties dialog; saving reloads the reader, so wait for that. */
async function saveProperties(page: Page, dialog: Locator) {
  await dialog.getByRole('button', { name: 'Save properties' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function setLanguage(page: Page, label: string) {
  const dialog = await openPageSettings(page);
  await languageField(dialog).selectOption({ label });
  await saveProperties(page, dialog);
}

async function expectLanguage(page: Page, value: string) {
  const dialog = await openPageSettings(page);
  await expect(languageField(dialog)).toHaveValue(value);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('a page language is optional and can be set by the people who edit the page', () => {
  test('a page starts without a language, and it can be set, changed and cleared', async ({ page }) => {
    test.setTimeout(120_000);
    const path = `lang-set-${Date.now()}`;

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await createPublishedPage(page, path, 'Language Set Test');

    // Nobody assigned one, so the page does not claim to be in any.
    const initial = await openPageSettings(page);
    await expect(languageField(initial)).toHaveValue('');
    await expect(languageField(initial).locator('option:checked')).toHaveText('Not set');
    await initial.getByRole('button', { name: 'Cancel' }).click();

    await setLanguage(page, 'Chinese (Simplified) (zh)');
    await expect(page).toHaveURL(`/wiki/${path}`);
    await expectLanguage(page, 'zh');

    await setLanguage(page, 'French (fr)');
    await expectLanguage(page, 'fr');

    await setLanguage(page, 'Not set');
    await expectLanguage(page, '');
  });

  test('a page with no language can be translated into English', async ({ page }) => {
    test.setTimeout(120_000);
    const path = `lang-unset-${Date.now()}`;

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    // English is a configured target language, as it would be on a wiki that
    // translates into it.
    const configured = await page.request.post('/api/translations/languages', { data: { code: 'en' } });
    expect([200, 201, 400]).toContain(configured.status());
    await createPublishedPage(page, path, 'Language Unset Test');

    const dialog = await openTranslateDialog(page);
    await expect(dialog.getByLabel('Target language')).toHaveValue('en');
    await expect(dialog.locator('select option[value="en"]')).toHaveJSProperty('disabled', false);
    await expect(dialog.getByText(/is unavailable because/)).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: "Change this page's language" })).toHaveCount(0);
  });

  test('a page recorded in the wrong language can be corrected from the dialog that refuses it', async ({ page }) => {
    test.setTimeout(120_000);
    const path = `lang-fix-${Date.now()}`;

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const configured = await page.request.post('/api/translations/languages', { data: { code: 'en' } });
    expect([200, 201, 400]).toContain(configured.status());
    await createPublishedPage(page, path, 'Language Fix Test');

    // The page is recorded as English although it is not.
    await setLanguage(page, 'English (en)');

    const refused = await openTranslateDialog(page);
    await expect(refused.locator('select option[value="en"]')).toHaveJSProperty('disabled', true);
    await expect(refused.getByText(/EN is unavailable because this page's language is set to EN/)).toBeVisible();

    // The way out is right there: it hands over to the page's properties.
    await refused.getByRole('button', { name: "Change this page's language" }).click();
    await expect(page.getByRole('dialog', { name: 'Translate this page' })).toHaveCount(0);
    const properties = page.getByRole('dialog', { name: 'Page properties' });
    await expect(properties).toBeVisible();
    await expect(languageField(properties)).toHaveValue('en');
    await languageField(properties).selectOption({ label: 'Chinese (Simplified) (zh)' });
    await saveProperties(page, properties);

    // English is no longer ruled out, and Chinese now is.
    const corrected = await openTranslateDialog(page);
    await expect(corrected.getByLabel('Target language')).toHaveValue('en');
    await expect(corrected.locator('select option[value="en"]')).toHaveJSProperty('disabled', false);
    await expect(corrected.locator('select option[value="zh"]')).toHaveJSProperty('disabled', true);
  });
});
