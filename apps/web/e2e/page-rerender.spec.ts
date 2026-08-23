import { test, expect, type Page } from '@playwright/test';
import { clickSignInSubmit } from './test-helpers';

/**
 * Manual re-render: rendered HTML is stored at write time, so a fix to the
 * render pipeline only reaches a page that is written again. The reader's
 * "More actions" menu offers a re-render that renders the stored Markdown with
 * the current pipeline without touching the content.
 */

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await clickSignInSubmit(page);
  await page.waitForURL('/');
}

test.describe('manual page re-render', () => {
  test('re-renders a published page from the More actions menu without changing it', async ({ page }) => {
    test.setTimeout(90_000);
    const slug = `rerender-${Date.now()}`;

    await login(page);
    await page.goto('/new');
    await page.getByLabel('Title').fill('Re-render Test');
    await page.getByLabel('Path').fill(slug);
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForURL(`/edit/${slug}`);
    await page.locator('.cm-content').fill('# Re-render Test\n\nRendered body text.');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(`/h/${slug}?compare=1..2`);
    await page.getByRole('button', { name: /publish this revision/i }).first().click();
    await page.waitForURL(`/wiki/${slug}`);

    // Capture the response body in the route handler: the page reloads as soon
    // as the request resolves, which discards the body Playwright could
    // otherwise read back from the network event.
    let payload: unknown;
    await page.route('**/rendering', async (route) => {
      const response = await route.fetch();
      payload = await response.json();
      await route.fulfill({ response });
    });

    await page.getByRole('button', { name: 'More actions' }).hover();
    await page.getByRole('button', { name: 'Re-render page' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Re-render page?')).toBeVisible();

    await dialog.getByRole('button', { name: 'Re-render', exact: true }).click();
    // The published revision and the latest draft are the same revision here,
    // so exactly one revision is rendered again.
    await expect.poll(() => payload).toMatchObject({ revisionsRendered: 1 });

    // The reader reloads on success and the content is unchanged.
    await expect(page).toHaveURL(`/wiki/${slug}`);
    await expect(page.getByText('Rendered body text.')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
