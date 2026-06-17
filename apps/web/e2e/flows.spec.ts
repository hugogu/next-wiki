import { test, expect, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
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
  return page.locator('textarea[placeholder="Write in Markdown..."]').fill(content);
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
    await page
      .getByRole('combobox', { name: new RegExp(`Change role for ${editorEmail}`) })
      .selectOption('editor');

    await login(page, editorEmail, 'Password123!');
    await page.goto('/new');
    await page.getByLabel('Path').fill(path);
    await page.getByLabel('Title').fill('Publish Flow Test');
    await fillEditor(page, 'draft content');
    await page.getByRole('button', { name: /save draft/i }).click();
    await page.waitForURL(`/${path}`);

    const readerContext = await browser.newContext();
    const readerPage = await readerContext.newPage();
    await registerReader(readerPage, readerEmail);
    await readerPage.goto(`/${path}`);
    await expect(readerPage.locator('h1:has-text("404")')).toBeVisible();

    await page.goto(`/edit/${path}`);
    await page.getByRole('button', { name: /publish/i }).click();
    await page.waitForURL(`/${path}`);

    await readerPage.reload();
    await expect(readerPage.locator('text=draft content')).toBeVisible();

    await page.goto(`/edit/${path}`);
    await fillEditor(page, 'updated draft content');
    await page.getByRole('button', { name: /save new draft/i }).click();
    await page.waitForURL(`/history/${path}`);

    await readerPage.goto(`/${path}`);
    await expect(readerPage.locator('text=draft content')).toBeVisible();
    await expect(readerPage.locator('text=updated draft content')).not.toBeVisible();

    await readerContext.close();
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
    const select = page.getByRole('combobox', { name: new RegExp(`Change role for ${targetEmail}`) });
    await select.selectOption('editor');

    await page.waitForTimeout(2000);

    await targetPage.goto('/new');
    await expect(targetPage.locator('h1:has-text("Create a new page")')).toBeVisible();

    await targetContext.close();
  });
});
