import { test, expect, type Page } from '@playwright/test';

// A minimal valid 1x1 PNG.
const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function metaContent(html: string, attribute: 'property' | 'name', key: string): string | null {
  const match = html.match(
    new RegExp(`<meta[^>]*${attribute}="${key}"[^>]*content="([^"]*)"`, 'i'),
  ) ?? html.match(new RegExp(`<meta[^>]*content="([^"]*)"[^>]*${attribute}="${key}"`, 'i'));
  return match?.[1] ?? null;
}

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('admin123');
  await page.getByRole('main').getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL('/');
}

async function createAndPublishPage(page: Page, path: string, title: string) {
  await page.goto('/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Path').fill(path);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(`/edit/${path}`);
  await page.locator('.cm-content').fill('Body content for the metadata regression test.');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(`/h/${path}?compare=1..2`);
  await page.getByRole('button', { name: /publish this revision/i }).first().click();
  await page.waitForURL(`/wiki/${path}`);
}

test.describe('reader page metadata', () => {
  // Regression test: a signed-in reader's request is proxied to the internal
  // (user)/registered-reader route (see apps/web/proxy.ts) so authenticated
  // traffic never enters the anonymous ISR cache. That route's
  // generateMetadata used to return a bare `{ robots: noindex }` stub, so
  // every page a logged-in user viewed showed the root layout's fallback
  // title/canonical instead of its own. Anonymous requests never hit that
  // route, so this bug was invisible to a plain (logged-out) curl/browser
  // check — it only reproduces while authenticated.
  test('shows the page-specific title and canonical URL, not the site root fallback, for a signed-in reader', async ({ page }) => {
    await login(page);
    const path = `reader-metadata-${Date.now()}`;
    const title = 'Reader Metadata Regression';
    await createAndPublishPage(page, path, title);

    await expect(page).toHaveTitle(new RegExp(`^${title} ·`));
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toContain(`/wiki/${path}`);
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toBe('noindex, nofollow');
  });

  // Link-preview regression: the reader route declared
  // `twitter:card = summary_large_image` but never emitted an `og:image`, so
  // sharing a page on X produced an empty grey placeholder instead of a card
  // even when the page had an illustration. `request` (not `page.request`)
  // carries no session, so this sees exactly what a crawler sees.
  test('exposes the first body image as the share card image for an anonymous crawler', async ({ page, request }) => {
    await login(page);
    const path = `share-card-${Date.now()}`;
    const title = 'Share Card Metadata';

    await page.goto('/new');
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Path').fill(path);
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForURL(`/edit/${path}`);

    await page.locator('.cm-content').click();
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Insert image' }).click();
    await (await fileChooserPromise).setFiles({
      name: 'pixel.png',
      mimeType: 'image/png',
      buffer: PNG_BUFFER,
    });
    await expect(page.locator('.cm-content')).toContainText('/api/v1/assets/', { timeout: 15_000 });

    const inserted = (await page.locator('.cm-content').textContent()) ?? '';
    const assetPath = inserted.match(/\/api\/v1\/assets\/[0-9a-f-]{36}\/content/)?.[0];
    expect(assetPath).toBeTruthy();

    // A leading heading repeating the title is the wiki convention; the card
    // description must skip it rather than echo the title twice.
    await page.locator('.cm-content').fill(
      `# ${title}\n\nBody paragraph for the share card.\n\n![Pixel illustration](${assetPath})\n`,
    );
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(`/h/${path}?compare=1..2`);
    await page.getByRole('button', { name: /publish this revision/i }).first().click();
    await page.waitForURL(`/wiki/${path}`);

    const anonymous = await request.get(`/wiki/${path}`);
    expect(anonymous.ok()).toBe(true);
    const html = await anonymous.text();

    const ogImage = metaContent(html, 'property', 'og:image');
    expect(ogImage).toContain(assetPath);
    expect(ogImage).toMatch(/^https?:\/\//);
    expect(metaContent(html, 'property', 'og:image:alt')).toBe('Pixel illustration');
    expect(metaContent(html, 'name', 'twitter:card')).toBe('summary_large_image');
    expect(metaContent(html, 'name', 'twitter:image')).toBe(ogImage);
    expect(metaContent(html, 'property', 'og:description')).toBe('Body paragraph for the share card.');
  });
});
