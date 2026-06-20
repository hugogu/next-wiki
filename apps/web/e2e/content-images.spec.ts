import { test, expect, type Page } from '@playwright/test';

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
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
}

async function uploadViaToolbar(page: Page) {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Insert image' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PNG_BUFFER });
}

test.describe('in-editor images', () => {
  test('uploads via the toolbar, renders in preview, and persists after publish', async ({
    page,
  }) => {
    const path = `image-flow-${Date.now()}`;
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await page.goto('/new');
    await page.getByRole('button', { name: 'Page properties' }).click();
    await page.getByLabel('Path').fill(path);
    await page.getByLabel('Title').fill('Image Flow');
    // Close properties dialog if it is modal; fall back to pressing Escape.
    await page.keyboard.press('Escape').catch(() => undefined);

    await page.locator('.cm-content').click();
    await uploadViaToolbar(page);

    // The asset reference is inserted at the cursor and rendered in the preview.
    await expect(page.locator('.cm-content')).toContainText('/api/assets/', { timeout: 15_000 });
    await expect(page.locator('img[src*="/api/assets/"]')).toBeVisible();

    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Publish' }).click();

    // Reload the published page and confirm the image still resolves.
    await page.goto(`/${path}`);
    const img = page.locator('img[src*="/api/assets/"]').first();
    await expect(img).toBeVisible();
  });

  test('denies image access for a non-existent or unauthorized asset', async ({ request }) => {
    const res = await request.get('/api/assets/00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBe(404);
  });
});
