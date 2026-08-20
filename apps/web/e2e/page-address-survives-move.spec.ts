import { test, expect, type Page } from '@playwright/test';
import { clickSignInSubmit } from './test-helpers';

/**
 * 035 (T030, US1): a page's public address survives any reorganization.
 * Publish a page, move it to a different branch of the tree via the page
 * properties dialog, then confirm the original URL still returns the page —
 * unchanged, in the address bar — and the breadcrumb reflects the new tree
 * location instead of the old one.
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

test.describe('page address survives reorganization', () => {
  test('moving a page in the tree leaves its public address, and the URL, unchanged', async ({ page }) => {
    test.setTimeout(90_000);
    const timestamp = Date.now();
    const originalPath = `slug-move-original-${timestamp}/install`;
    const newTreeLocation = `slug-move-relocated-${timestamp}/onboarding/install`;

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await createPage(page, originalPath, 'Slug Move Test');
    await fillEditor(page, '# Slug Move Test\n\nOriginal content.');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(`/h/${originalPath}?compare=1..2`);
    await publishPage(page, originalPath);

    // Address before the move: the canonical (default) slug is the tree path.
    await expect(page).toHaveURL(`/wiki/${originalPath}`);

    // Move the page to a different branch of the tree via the reader's
    // "Page settings" dialog — this changes `path`, never `slug` (FR-002).
    // "Page settings" lives inside the hover-revealed "More actions" menu.
    await page.getByRole('button', { name: 'More actions' }).hover();
    await page.getByRole('button', { name: 'Page settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Page properties' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Storage path').fill(newTreeLocation);
    await dialog.getByRole('button', { name: 'Save properties' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // The client reloads at the *same* URL after a path-only change — the
    // address bar must never have moved to a URL built from the new path.
    await expect(page).toHaveURL(`/wiki/${originalPath}`);
    await expect(page.locator('text=Original content.')).toBeVisible();

    // Revisiting the original address directly still works after reload.
    await page.goto(`/wiki/${originalPath}`);
    await expect(page.locator('h1', { hasText: 'Slug Move Test' }).first()).toBeVisible();
    await expect(page.locator('text=Original content.')).toBeVisible();

    // Breadcrumbs are derived from the *new* tree location. Neither the old
    // nor the new intermediate folder appears as a crumb — a folder with no
    // page of its own owns no address to link to — but the page itself is
    // still shown as the final, current crumb.
    const breadcrumbNav = page.getByRole('navigation', { name: /breadcrumb/i });
    await expect(breadcrumbNav).toContainText('Slug Move Test');
    await expect(breadcrumbNav).not.toContainText(newTreeLocation.split('/')[0]!);
    await expect(breadcrumbNav).not.toContainText(originalPath.split('/')[0]!);

    // Cleanup.
    const lookupResponse = await page.request.get(`/api/v1/pages?path=${encodeURIComponent(newTreeLocation)}`);
    expect(lookupResponse.ok()).toBe(true);
    const lookupBody = await lookupResponse.json();
    const pageId = lookupBody.items[0]?.id;
    expect(pageId).toBeTruthy();
    await page.request.delete(`/api/v1/pages/${pageId}`);
  });
});
