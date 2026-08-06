import { test, expect, type Page } from '@playwright/test';
import { clickSignInSubmit } from './test-helpers';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

// A minimal valid 1x1 PNG (~70 bytes) and a tiny text file, both well under
// the default 20 MB limit but large enough to exceed a 1 KB test limit.
const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const PDF_BUFFER = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2048, 'x')]);

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await clickSignInSubmit(page);
  await page.waitForURL('/');
}

async function createPage(page: Page, path: string, title: string) {
  await page.goto('/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Path').fill(path);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(`/edit/${path}`);
}

async function openProperties(page: Page) {
  await page.getByRole('button', { name: 'Page properties' }).click();
}

async function attachViaPanel(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Attach file' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(file);
}

async function resetAttachmentSettings(page: Page) {
  await page.goto('/admin/attachments');
  await page.getByLabel('Maximum attachment size (MB)').fill('20');
  for (const category of ['Images (PNG, JPEG, GIF, WebP)', 'Videos (MP4, WebM)', 'Documents (PDF, plain text, Markdown, CSV, Office, OpenDocument)']) {
    const toggle = page.getByRole('switch', { name: category });
    if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  }
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
}

test.describe('admin attachment settings', () => {
  test.afterEach(async ({ page }) => {
    await login(page);
    await resetAttachmentSettings(page);
  });

  test('default limits accept an image and a document out of the box', async ({ page }) => {
    const path = `attach-defaults-${Date.now()}`;
    await login(page);
    await createPage(page, path, 'Attach Defaults');
    await openProperties(page);

    await attachViaPanel(page, { name: 'pixel.png', mimeType: 'image/png', buffer: PNG_BUFFER });
    await expect(page.getByText('pixel.png')).toBeVisible({ timeout: 15_000 });

    await attachViaPanel(page, { name: 'doc.pdf', mimeType: 'application/pdf', buffer: PDF_BUFFER });
    await expect(page.getByText('doc.pdf')).toBeVisible({ timeout: 15_000 });
  });

  test('a lowered size limit refuses a new over-limit upload but keeps existing attachments downloadable', async ({ page }) => {
    const path = `attach-size-limit-${Date.now()}`;
    await login(page);
    await createPage(page, path, 'Attach Size Limit');
    await openProperties(page);
    await attachViaPanel(page, { name: 'existing.pdf', mimeType: 'application/pdf', buffer: PDF_BUFFER });
    await expect(page.getByText('existing.pdf')).toBeVisible({ timeout: 15_000 });

    await page.goto('/admin/attachments');
    await page.getByLabel('Maximum attachment size (MB)').fill('1');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    await page.goto(`/edit/${path}`);
    await openProperties(page);
    // Pre-existing attachment survives the stricter limit (SC-005).
    await expect(page.getByText('existing.pdf')).toBeVisible();

    const oversized = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2 * 1024 * 1024, 'x')]);
    await attachViaPanel(page, { name: 'toolarge.pdf', mimeType: 'application/pdf', buffer: oversized });
    // The panel surfaces the server's specific reason (FR-011), not a generic message.
    await expect(page.getByText(/exceeds the maximum allowed size/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('toolarge.pdf')).not.toBeVisible();
  });

  test('narrowing allowed categories refuses a disallowed type but keeps existing attachments downloadable', async ({ page }) => {
    const path = `attach-category-limit-${Date.now()}`;
    await login(page);
    await createPage(page, path, 'Attach Category Limit');
    await openProperties(page);
    await attachViaPanel(page, { name: 'existing.png', mimeType: 'image/png', buffer: PNG_BUFFER });
    await expect(page.getByText('existing.png')).toBeVisible({ timeout: 15_000 });

    await page.goto('/admin/attachments');
    await page.getByRole('switch', { name: 'Images (PNG, JPEG, GIF, WebP)' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    await page.goto(`/edit/${path}`);
    await openProperties(page);
    // Pre-existing image attachment survives the narrowed category list (SC-005).
    await expect(page.getByText('existing.png')).toBeVisible();

    await attachViaPanel(page, { name: 'blocked.png', mimeType: 'image/png', buffer: PNG_BUFFER });
    await expect(page.getByText(/unsupported or disallowed attachment type/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('blocked.png')).not.toBeVisible();
  });
});
