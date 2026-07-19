import { test, expect, type Page } from '@playwright/test';
import { clickSignInSubmit } from './test-helpers';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

// A minimal valid 1x1 PNG.
const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await clickSignInSubmit(page);
  await page.waitForURL('/');
}

async function uploadViaToolbar(page: Page) {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Insert image' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PNG_BUFFER });
}

async function createPage(page: Page, path: string, title: string) {
  await page.goto('/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Path').fill(path);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(`/edit/${path}`);
}

test.describe('in-editor images', () => {
  test('uploads via the toolbar, renders in preview, and persists after publish', async ({
    page,
  }) => {
    const path = `image-flow-${Date.now()}`;
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await createPage(page, path, 'Image Flow');

    await page.locator('.cm-content').click();
    await uploadViaToolbar(page);

    // The asset reference is inserted at the cursor and rendered in the preview.
    await expect(page.locator('.cm-content')).toContainText('/api/v1/assets/', { timeout: 15_000 });
    await expect(page.locator('img[src*="/api/v1/assets/"]')).toBeVisible();

    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(`/history/${path}`);
    await page.getByRole('button', { name: /publish this revision/i }).first().click();
    await page.waitForURL(`/${path}`);

    // Reload the published page and confirm the image still resolves.
    await page.reload();
    const img = page.locator('img[src*="/api/v1/assets/"]').first();
    await expect(img).toBeVisible();
  });

  test('denies image access for a non-existent or unauthorized asset', async ({ request }) => {
    const res = await request.get('/api/assets/00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBe(404);
  });
});
