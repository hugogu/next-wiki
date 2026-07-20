import { test, expect, type Page } from '@playwright/test';
import { clickSignInSubmit } from './test-helpers';

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

async function savePage(page: Page) {
  await page.getByRole('button', { name: 'Save' }).click();
}

async function publishPage(page: Page, path: string) {
  await page.getByRole('button', { name: /publish this revision/i }).first().click();
  await page.waitForURL(`/${path}`);
}

test.describe('access control flows', () => {
  test('reader is denied editor/admin URLs without leaking resource existence', async ({ page }) => {
    await registerReader(page, `reader-denied-${Date.now()}@example.com`);

    await page.goto('/new');
    await expect(page.locator('h1:has-text("404")')).toBeVisible();

    await page.goto('/some-draft-page/edit');
    await expect(page.locator('h1:has-text("404")')).toBeVisible();

    await page.goto('/admin/users');
    await expect(page.locator('h1:has-text("404")')).toBeVisible();
  });
});

test.describe('publish workflow', () => {
  test('editor drafts, publishes, and readers see only published version', async ({ page, browser }) => {
    const timestamp = Date.now();
    const editorEmail = `editor-pub-${timestamp}@example.com`;
    const readerEmail = `reader-pub-${timestamp}@example.com`;
    const path = `publish-flow-${timestamp}`;

    await registerReader(page, editorEmail);
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/users');
    await changeRole(page, editorEmail, 'editor');

    await login(page, editorEmail, 'Password123!');
    await createPage(page, path, 'Publish Flow Test');
    await fillEditor(page, 'draft content');
    await savePage(page);
    await page.waitForURL(`/history/${path}?compare=1..2`);

    const readerContext = await browser.newContext();
    const readerPage = await readerContext.newPage();
    await registerReader(readerPage, readerEmail);
    await readerPage.goto(`/${path}`);
    await expect(readerPage.locator('h1:has-text("404")')).toBeVisible();

    await publishPage(page, path);
    await expect(page.locator('text=This page is a draft')).not.toBeVisible();

    await readerPage.reload();
    await expect(readerPage.locator('text=draft content')).toBeVisible();

    await page.goto(`/edit/${path}`);
    await fillEditor(page, 'updated draft content');
    await savePage(page);
    await page.waitForURL(`/history/${path}?compare=2..3`);

    await readerPage.goto(`/${path}`);
    await expect(readerPage.locator('text=draft content')).toBeVisible();
    await expect(readerPage.locator('text=updated draft content')).not.toBeVisible();

    await readerContext.close();

    // Clean up the test page so it does not pollute the environment.
    const lookupResponse = await page.request.get(`/api/v1/pages?path=${path}`);
    expect(lookupResponse.ok()).toBe(true);
    const lookupBody = await lookupResponse.json();
    const pageId = lookupBody.items[0]?.id;
    expect(pageId).toBeTruthy();
    const deleteResponse = await page.request.delete(`/api/v1/pages/${pageId}`);
    expect(deleteResponse.ok()).toBe(true);
  });
});

test.describe('admin role change', () => {
  test('role change is effective mid-session without re-login', async ({ page, browser }) => {
    const timestamp = Date.now();
    const targetEmail = `target-role-${timestamp}@example.com`;

    const targetContext = await browser.newContext();
    const targetPage = await targetContext.newPage();
    await registerReader(targetPage, targetEmail);

    await targetPage.goto('/new');
    await expect(targetPage.locator('h1:has-text("404")')).toBeVisible();

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/users');
    await changeRole(page, targetEmail, 'editor');

    await targetPage.goto('/new');
    await expect(targetPage.getByLabel('Title')).toBeVisible();

    await targetContext.close();
  });
});
