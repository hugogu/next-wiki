import { test, expect, type Page } from '@playwright/test';

/**
 * Role/publish end-to-end flows (SC-006, SC-004, SC-005).
 */

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
    const slug = `publish-flow-${timestamp}`;

    // Promote a registered reader to editor via the seeded admin.
    await registerReader(page, editorEmail);
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/users');
    await page
      .getByRole('combobox', { name: new RegExp(`Change role for ${editorEmail}`) })
      .selectOption('editor');

    // Editor creates a page (saves as draft).
    await login(page, editorEmail, 'Password123!');
    await page.goto('/new');
    await page.getByLabel('Slug').fill(slug);
    await page.getByLabel('Title').fill('Publish Flow Test');
    await page.locator('.toastui-editor-md-container .ProseMirror').fill('draft content');
    await page.getByRole('button', { name: /save draft/i }).click();
    await page.waitForURL(`/${slug}`);

    // Reader cannot see the draft page.
    const readerContext = await browser.newContext();
    const readerPage = await readerContext.newPage();
    await registerReader(readerPage, readerEmail);
    await readerPage.goto(`/${slug}`);
    await expect(readerPage.locator('h1:has-text("404")')).toBeVisible();

    // Editor publishes the draft.
    await page.goto(`/${slug}/edit`);
    await page.getByRole('button', { name: /publish this revision/i }).click();
    await page.waitForURL(`/${slug}`);

    // Reader now sees the published content.
    await readerPage.reload();
    await expect(readerPage.locator('text=draft content')).toBeVisible();

    // Editor creates a new draft; reader still sees published content.
    await page.goto(`/${slug}/edit`);
    await page.locator('.toastui-editor-md-container .ProseMirror').fill('updated draft content');
    await page.getByRole('button', { name: /save new draft/i }).click();
    await page.waitForURL(`/${slug}/history`);

    await readerPage.goto(`/${slug}`);
    await expect(readerPage.locator('text=draft content')).toBeVisible();
    await expect(readerPage.locator('text=updated draft content')).not.toBeVisible();

    await readerContext.close();
  });
});

test.describe('admin role change', () => {
  test('role change is effective mid-session without re-login', async ({ page, browser }) => {
    const timestamp = Date.now();
    const targetEmail = `target-role-${timestamp}@example.com`;

    // In a separate context, register the target user as reader.
    const targetContext = await browser.newContext();
    const targetPage = await targetContext.newPage();
    await registerReader(targetPage, targetEmail);

    // Reader cannot create pages.
    await targetPage.goto('/new');
    await expect(targetPage.locator('h1:has-text("404")')).toBeVisible();

    // Admin promotes reader to editor.
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/users');
    const select = page.getByRole('combobox', { name: new RegExp(`Change role for ${targetEmail}`) });
    await select.selectOption('editor');

    // Wait for router.refresh() to complete and the page to re-render with new role.
    await page.waitForTimeout(2000);

    // Target user's next request reflects the new role.
    await targetPage.goto('/new');
    await expect(targetPage.locator('h1:has-text("Create a new page")')).toBeVisible();

    await targetContext.close();
  });
});
