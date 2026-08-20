import { test, expect, type Page } from '@playwright/test';
import { clickSignInSubmit } from './test-helpers';

/**
 * 035 (T066, US4): a page owner can add and remove alias addresses from the
 * page itself, in a handful of deliberate actions. A manual alias is
 * immediate; a retained alias additionally requires space-manage permission
 * (FR-022a) — a plain editor is refused, not silently ignored.
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

async function registerReader(page: Page, email: string) {
  await page.goto('/auth/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('/');
}

async function changeRole(page: Page, email: string, role: 'reader' | 'editor' | 'admin') {
  const select = page.getByRole('combobox', { name: new RegExp(`Change role for ${email}`) });
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/api/users/') &&
      response.url().endsWith('/role') &&
      response.request().method() === 'POST' &&
      response.ok(),
    ),
    select.selectOption(role),
  ]);
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

async function openPageSettings(page: Page) {
  await page.getByRole('button', { name: 'More actions' }).hover();
  await page.getByRole('button', { name: 'Page settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Page properties' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('managing a page address from the page itself', () => {
  test('adding and removing a manual alias takes a handful of actions and changes what resolves', async ({ page }) => {
    test.setTimeout(90_000);
    const timestamp = Date.now();
    const path = `alias-mgmt-${timestamp}`;
    const alias = `alias-mgmt-alt-${timestamp}`;

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await createPage(page, path, 'Alias Management Test');
    await fillEditor(page, '# Alias Management Test\n\nContent.');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(`/h/${path}?compare=1..2`);
    await publishPage(page, path);

    // From the page itself: open settings (1), fill the alias field (2),
    // click "Add alias" (3) — three deliberate actions.
    const dialog = await openPageSettings(page);
    await dialog.getByLabel('Add an alias address').fill(alias);
    await dialog.getByRole('button', { name: 'Add alias' }).click();
    await expect(dialog.getByText(alias)).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();

    const redirect = await page.request.get(`/wiki/${alias}`, { maxRedirects: 0 });
    expect([301, 307, 308]).toContain(redirect.status());
    expect(new URL(redirect.headers().location!, page.url()).pathname).toBe(`/wiki/${path}`);

    // Remove it: open settings (1), click remove (2) — a manual alias needs
    // no confirmation, so this is only two actions.
    const dialogAgain = await openPageSettings(page);
    await dialogAgain.getByRole('button', { name: `Remove ${alias}` }).click();
    await expect(dialogAgain.getByText(alias)).toHaveCount(0);
    await dialogAgain.getByRole('button', { name: 'Close' }).click();

    const afterRemoval = await page.request.get(`/wiki/${alias}`);
    expect(afterRemoval.status()).toBe(404);

    // Cleanup.
    const lookup = await page.request.get(`/api/v1/pages?path=${encodeURIComponent(path)}`);
    const body = await lookup.json();
    const pageId = body.items[0]?.id;
    expect(pageId).toBeTruthy();
    await page.request.delete(`/api/v1/pages/${pageId}`);
  });

  test('a plain editor cannot remove a retained alias; an admin can, after confirming', async ({ page, browser }) => {
    test.setTimeout(90_000);
    const timestamp = Date.now();
    const path = `alias-perm-${timestamp}`;
    const renamedTo = `alias-perm-renamed-${timestamp}`;
    const editorEmail = `alias-editor-${timestamp}@example.com`;

    // Set up: publish a page, then rename its slug to generate a genuine
    // retained alias for the *original* address.
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await createPage(page, path, 'Alias Permission Test');
    await fillEditor(page, '# Alias Permission Test\n\nContent.');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(`/h/${path}?compare=1..2`);
    await publishPage(page, path);

    const renameDialog = await openPageSettings(page);
    await renameDialog.getByLabel('Address').fill(renamedTo);
    await renameDialog.getByRole('button', { name: 'Save properties' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.waitForURL(`/wiki/${renamedTo}`);

    // Promote a fresh reader to editor.
    await registerReader(page, editorEmail);
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/users');
    await changeRole(page, editorEmail, 'editor');

    // The editor can open settings and see the retained alias, but removing
    // it is refused — not silently ignored.
    const editorContext = await browser.newContext();
    const editorPage = await editorContext.newPage();
    await login(editorPage, editorEmail, 'Password123!');
    await editorPage.goto(`/wiki/${renamedTo}`);
    const editorDialog = await openPageSettings(editorPage);
    await editorDialog.getByRole('button', { name: `Remove ${path}` }).click();
    // A retained alias asks for confirmation first.
    await expect(editorPage.getByText(/permanently stop working/i)).toBeVisible();
    await editorPage.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(editorPage.getByText('You do not have permission to do this.')).toBeVisible();
    await editorContext.close();

    // The admin, after the same confirmation, succeeds.
    await page.goto(`/wiki/${renamedTo}`);
    const adminDialog = await openPageSettings(page);
    await adminDialog.getByRole('button', { name: `Remove ${path}` }).click();
    await expect(page.getByText(/permanently stop working/i)).toBeVisible();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByText(path, { exact: true })).toHaveCount(0);

    const oldAddress = await page.request.get(`/wiki/${path}`);
    expect(oldAddress.status()).toBe(404);

    // Cleanup.
    const lookup = await page.request.get(`/api/v1/pages?path=${encodeURIComponent(path)}`);
    const body = await lookup.json();
    const pageId = body.items[0]?.id;
    expect(pageId).toBeTruthy();
    await page.request.delete(`/api/v1/pages/${pageId}`);
  });
});
