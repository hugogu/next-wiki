import { test, expect, type Page } from '@playwright/test';
import { clickSignInSubmit } from './test-helpers';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const TEXT_CONTENT = 'plain text attachment content for the happy-path e2e test\n';

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

test.describe('page attachments happy path (US1-US3)', () => {
  test('attach, see it listed, download it byte-for-byte, publish, see it on the reader page, then remove it', async ({
    page,
    context,
  }) => {
    const path = `attach-happy-path-${Date.now()}`;
    await login(page);
    await createPage(page, path, 'Attach Happy Path');

    // US1: attach — appears in the list immediately.
    await openProperties(page);
    await attachViaPanel(page, { name: 'pixel.png', mimeType: 'image/png', buffer: PNG_BUFFER });
    await expect(page.getByText('pixel.png')).toBeVisible({ timeout: 15_000 });
    await attachViaPanel(page, {
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(TEXT_CONTENT),
    });
    await expect(page.getByText('notes.txt')).toBeVisible({ timeout: 15_000 });

    // US2: download — a browser-safe type (PNG) opens inline in a new tab
    // rather than forcing a download (FR-014).
    const [inlineTab] = await Promise.all([
      context.waitForEvent('page'),
      page.getByText('pixel.png').click(),
    ]);
    await inlineTab.waitForLoadState();
    expect(inlineTab.url()).toContain('blob:');
    await inlineTab.close();

    // A non-safe type (plain text) forces a real download with the exact
    // original bytes (FR-002/SC-002), not a transformed copy (FR-015).
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByText('notes.txt').click(),
    ]);
    expect(download.suggestedFilename()).toBe('notes.txt');
    const downloadedPath = await download.path();
    const fs = await import('node:fs/promises');
    const downloadedContent = downloadedPath ? await fs.readFile(downloadedPath, 'utf8') : null;
    expect(downloadedContent).toBe(TEXT_CONTENT);

    // Publish so the reader-facing (non-edit) view is exercised too.
    await page.keyboard.press('Escape');
    await page.locator('.cm-content').click();
    await page.keyboard.type('Published body for the attachment happy-path test.');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(`/h/${path}?compare=1..2`);
    await page.getByRole('button', { name: /publish this revision/i }).first().click();
    await page.waitForURL(`/wiki/${path}`);

    // Reader view: no edit affordance, but both attachments are listed with
    // working download links (US2's "any user who can read the page").
    await expect(page.getByText('pixel.png')).toBeVisible();
    await expect(page.getByText('notes.txt')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Attach file' })).toHaveCount(0);

    // US3: remove — from the edit view, with the confirm dialog (not a
    // native browser confirm()).
    await page.goto(`/edit/${path}`);
    await openProperties(page);
    await page.getByRole('button', { name: 'Remove notes.txt' }).click();
    await expect(page.getByRole('heading', { name: 'Remove attachment' })).toBeVisible();
    const removeResponse = page.waitForResponse((response) =>
      response.request().method() === 'DELETE'
      && response.url().includes('/api/v1/attachments/')
      && response.status() === 204,
    );
    await Promise.all([
      removeResponse,
      page.getByRole('button', { name: 'Remove', exact: true }).click(),
    ]);
    await expect(page.getByRole('heading', { name: 'Remove attachment' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'notes.txt' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'pixel.png' })).toBeVisible();

    // Removed attachment disappears from the reader view too.
    await page.goto(`/wiki/${path}`);
    await expect(page.getByRole('link', { name: 'notes.txt' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'pixel.png' })).toBeVisible();
  });
});
