import { test, expect, type Page } from '@playwright/test';
import { clickSignInSubmit } from './test-helpers';

/**
 * 035 (T052, US3): the system refuses addresses that would collide, before
 * ever saving, with a distinct message per violated rule (FR-018/FR-019).
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

async function attemptCreate(page: Page, path: string, title: string) {
  await page.goto('/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Path').fill(path);
  await page.getByRole('button', { name: 'Create' }).click();
}

async function createPage(page: Page, path: string, title: string) {
  await attemptCreate(page, path, title);
  await page.waitForURL(`/edit/${path}`);
}

test.describe('page creation rejects colliding addresses before saving', () => {
  test('a built-in route, a locale segment, and a static-site prefix are each rejected with their own message', async ({ page }) => {
    test.setTimeout(90_000);
    const timestamp = Date.now();

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // A built-in app route: rejected as a reserved *path* (pre-035 behavior).
    // `admin` alone is a route *group* (transparent in the URL) and has no
    // page.tsx of its own, so it is not reserved — `admin/users` is.
    await attemptCreate(page, 'admin/users', 'Reserved Route Attempt');
    await expect(page.getByText('This path is reserved by built-in functionality. Please choose a different path.')).toBeVisible();
    await expect(page).toHaveURL('/new');

    // A configured translation-language segment: rejected as a reserved
    // *address* (035) — a distinct message from the reserved-path case above.
    // `zh` is seeded as a translation language in the e2e fixture.
    await attemptCreate(page, `zh/tutorial-${timestamp}`, 'Locale Segment Attempt');
    await expect(page.getByText("This page's default address is reserved by built-in functionality. Please choose a different path.")).toBeVisible();
    await expect(page).toHaveURL('/new');

    // A static-site reserved prefix: also rejected as a reserved address.
    await attemptCreate(page, 'pagefind/index', 'Static Site Prefix Attempt');
    await expect(page.getByText("This page's default address is reserved by built-in functionality. Please choose a different path.")).toBeVisible();
    await expect(page).toHaveURL('/new');

    // A legitimate multi-level path still saves without any rejection.
    const okPath = `slug-conflicts-ok-${timestamp}`;
    await createPage(page, okPath, 'Legitimate Page');

    // Cleanup.
    const lookup = await page.request.get(`/api/v1/pages?path=${encodeURIComponent(okPath)}`);
    const body = await lookup.json();
    const pageId = body.items[0]?.id;
    expect(pageId).toBeTruthy();
    await page.request.delete(`/api/v1/pages/${pageId}`);
  });

  test('an address already taken by another page (via a prior rename) is rejected distinctly from an ordinary path conflict', async ({ page }) => {
    test.setTimeout(90_000);
    const timestamp = Date.now();
    const originalPath = `slug-conflicts-holder-${timestamp}`;
    const renamedAddress = `slug-conflicts-taken-${timestamp}`;

    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Page A ends up with a canonical address that differs from its path.
    await createPage(page, originalPath, 'Address Holder');
    await page.getByRole('button', { name: 'Page properties' }).click();
    const propertiesDialog = page.getByRole('dialog', { name: 'Page properties' });
    await expect(propertiesDialog).toBeVisible();
    await propertiesDialog.getByLabel('Canonical', { exact: true }).fill(renamedAddress);
    await propertiesDialog.getByRole('button', { name: 'Save properties' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Page B's default address (= its path) collides with A's *renamed*
    // address, even though the two pages have entirely different paths —
    // this is a slug conflict, not a path conflict, and must say so.
    await attemptCreate(page, renamedAddress, 'Address Conflict Attempt');
    await expect(page.getByText('This path already exists.')).toHaveCount(0);
    await expect(page.getByText("This page's default address is already used by another page. Try a different path.")).toBeVisible();
    await expect(page).toHaveURL('/new');

    // Cleanup.
    const lookup = await page.request.get(`/api/v1/pages?path=${encodeURIComponent(originalPath)}`);
    const body = await lookup.json();
    const pageId = body.items[0]?.id;
    expect(pageId).toBeTruthy();
    await page.request.delete(`/api/v1/pages/${pageId}`);
  });
});
