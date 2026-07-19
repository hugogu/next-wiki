import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import postgres from 'postgres';

/**
 * Raw content renderer dispatch + admin taxonomy (022 Phase 11, T070). Runs
 * serially with a single worker; restores Copilot mode and clears raw data
 * afterwards so later spec files are unaffected.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'postgresql://wiki:wiki@127.0.0.1:15433/wiki_e2e_test';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'latin1');

function database() {
  return postgres(E2E_DATABASE_URL, { max: 1 });
}

async function setWritingMode(mode: 'copilot' | 'llm-wiki') {
  const sql = database();
  try {
    await sql`
      INSERT INTO writing_mode_settings (id, mode, updated_at)
      VALUES ('default', ${mode}, now())
      ON CONFLICT (id) DO UPDATE SET mode = EXCLUDED.mode, pending_mode = null, switch_job_id = null, updated_at = now()`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function seedRawEntry(
  path: string,
  title: string,
  contentType: string,
  source: string,
  originalBytes?: Buffer,
) {
  const sql = database();
  try {
    const [admin] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${ADMIN_EMAIL}`;
    const [space] = await sql<{ id: string }[]>`SELECT id FROM spaces WHERE slug = 'raw'`;
    const [category] = await sql<{ id: string }[]>`SELECT id FROM raw_categories WHERE is_default = true LIMIT 1`;
    const slug = path.split('/').at(-1)!;
    const [page] = await sql<{ id: string }[]>`
      INSERT INTO pages (space_id, slug, path, title, author_id, nature, visibility, raw_category_id)
      VALUES (${space!.id}, ${slug}, ${path}, ${title}, ${admin!.id}, 'original', 'restricted', ${category!.id})
      ON CONFLICT (space_id, path, locale) DO UPDATE SET title = EXCLUDED.title
      RETURNING id`;

    let originalAssetId: string | null = null;
    if (originalBytes) {
      const hash = createHash('sha256').update(originalBytes).digest('hex');
      const [asset] = await sql<{ id: string }[]>`
        INSERT INTO content_assets (kind, content_hash, content_type, size_bytes, created_by)
        VALUES ('raw', ${hash}, ${contentType}, ${originalBytes.length}, ${admin!.id})
        RETURNING id`;
      await sql`INSERT INTO content_blobs (asset_id, bytes) VALUES (${asset!.id}, ${originalBytes})`;
      originalAssetId = asset!.id;
    }

    const hash = createHash('sha256').update(source).digest('hex');
    const [revision] = await sql<{ id: string }[]>`
      INSERT INTO page_revisions (page_id, version_number, content_type, content_source, content_html, content_hash, author_id, status, actor_kind, source_metadata, original_asset_id, published_at)
      VALUES (${page!.id}, 1, ${contentType}, ${source}, ${`<pre>${title}</pre>`}, ${hash}, ${admin!.id}, 'published', 'machine', ${sql.json({ inputKind: 'manual-note' })}, ${originalAssetId}, now())
      ON CONFLICT (page_id, version_number) DO UPDATE SET content_type = EXCLUDED.content_type, content_source = EXCLUDED.content_source, original_asset_id = EXCLUDED.original_asset_id
      RETURNING id`;
    await sql`
      UPDATE pages SET current_published_version_id = ${revision!.id}, latest_version_id = ${revision!.id}, deleted_at = null WHERE id = ${page!.id}`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function clearRaw() {
  const sql = database();
  try {
    await sql`DELETE FROM page_revisions WHERE page_id IN (SELECT id FROM pages WHERE space_id = (SELECT id FROM spaces WHERE slug = 'raw'))`;
    await sql`DELETE FROM pages WHERE space_id = (SELECT id FROM spaces WHERE slug = 'raw')`;
    await sql`DELETE FROM content_assets WHERE kind = 'raw'`;
    await sql`DELETE FROM raw_categories WHERE slug <> 'reference'`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.locator('form').getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
}

test.describe('raw content renderer + taxonomy', () => {
  test.beforeEach(async () => {
    await setWritingMode('llm-wiki');
    await seedRawEntry('e2e/json', 'JSON entry', 'application/json', '{"b":2,"a":1}');
    await seedRawEntry('e2e/log', 'Log entry', 'text/x-log', 'line one\nline two');
    await seedRawEntry('e2e/md', 'Markdown entry', 'text/markdown', '# Heading\n\nBody text.');
    await seedRawEntry('e2e/report', 'PDF entry', 'application/pdf', 'extracted text', PDF_BYTES);
  });

  test.afterAll(async () => {
    await clearRaw();
    await setWritingMode('copilot');
  });

  test('dispatches raw renderers by content type with a download affordance', async ({ page }) => {
    await login(page);

    // JSON is pretty-printed in a <pre>.
    await page.goto('/spaces/raw/e2e/json');
    const json = page.locator('[data-testid="raw-content"]');
    await expect(json).toHaveAttribute('data-content-type', 'application/json');
    await expect(json.locator('pre')).toContainText('"a": 1');

    // Log renders in a monospace <pre>.
    await page.goto('/spaces/raw/e2e/log');
    await expect(page.locator('[data-testid="raw-content"]')).toHaveAttribute('data-content-type', 'text/x-log');
    await expect(page.locator('[data-testid="raw-content"] pre')).toContainText('line two');

    // Markdown renders through the markdown renderer (a real heading element).
    await page.goto('/spaces/raw/e2e/md');
    await expect(page.getByRole('heading', { name: 'Heading' })).toBeVisible();

    // PDF renders in an iframe of the original bytes + offers a download.
    await page.goto('/spaces/raw/e2e/report');
    const pdf = page.locator('[data-testid="raw-content"]');
    await expect(pdf).toHaveAttribute('data-content-type', 'application/pdf');
    await expect(pdf.locator('iframe')).toHaveAttribute('src', /\/api\/raw-assets\/[0-9a-f-]+$/);
    const download = pdf.getByRole('link', { name: /download original/i });
    await expect(download).toHaveAttribute('href', /\/api\/raw-assets\/[0-9a-f-]+\?download=1$/);

    // The original bytes are served (Admin-gated) with the declared content type.
    const assetHref = await pdf.locator('iframe').getAttribute('src');
    const assetResponse = await page.request.get(assetHref!);
    expect(assetResponse.ok()).toBe(true);
    expect(assetResponse.headers()['content-type']).toContain('application/pdf');
  });

  test('admin manages the raw taxonomy', async ({ page }) => {
    await login(page);
    await page.goto('/admin/raw-categories');

    await expect(page.getByRole('heading', { name: /raw categories/i })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'reference', exact: true })).toBeVisible();

    await page.getByRole('button', { name: /new category/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('Incidents');
    await dialog.getByLabel('Slug').fill('incidents');
    await dialog.getByRole('button', { name: /save/i }).click();

    await expect(page.getByRole('cell', { name: 'incidents', exact: true })).toBeVisible();
  });
});
