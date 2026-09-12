import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import postgres from 'postgres';
import { assertIsTestDatabase } from '../test/test-db';

const databaseUrl = process.env.E2E_DATABASE_URL || 'postgresql://wiki:wiki@127.0.0.1:15433/wiki_e2e_test';
assertIsTestDatabase(databaseUrl);

test('the public Generated reader produces a working anonymous share link', async ({ page }) => {
  const sql = postgres(databaseUrl, { max: 1 });
  const slug = `share-generated-${Date.now()}`;
  let pageId: string | undefined;
  try {
    await sql`
      INSERT INTO writing_mode_settings (id, mode) VALUES ('default', 'llm-wiki')
      ON CONFLICT (id) DO UPDATE SET mode = EXCLUDED.mode`;
    const [author] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = 'admin@example.com'`;
    const [space] = await sql<{ id: string }[]>`SELECT id FROM spaces WHERE slug = 'generated'`;
    const [created] = await sql<{ id: string }[]>`
      INSERT INTO pages (space_id, slug, path, title, author_id, visibility, nature)
      VALUES (${space!.id}, ${slug}, ${slug}, 'Shared Generated Audit', ${author!.id}, 'public', 'generated')
      RETURNING id`;
    pageId = created!.id;
    const source = '# Shared Generated Audit\n\nPublished audit findings.';
    const hash = createHash('sha256').update(source).digest('hex');
    const [revision] = await sql<{ id: string }[]>`
      INSERT INTO page_revisions (page_id, version_number, content_source, content_html, content_hash, author_id, status, published_at)
      VALUES (${pageId}, 1, ${source}, '<h1>Shared Generated Audit</h1><p>Published audit findings.</p>', ${hash}, ${author!.id}, 'published', now())
      RETURNING id`;
    await sql`UPDATE pages SET current_published_version_id = ${revision!.id}, latest_version_id = ${revision!.id} WHERE id = ${pageId}`;

    const reader = await page.goto(`/generated/${slug}`);
    expect(reader?.status()).toBe(200);
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const shareUrl = await page.locator('input[readonly]').inputValue();
    expect(new URL(shareUrl).pathname).toBe(`/s/${pageId}`);
    const shared = await page.goto(shareUrl);
    expect(shared?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Shared Generated Audit' })).toBeVisible();
    await expect(page.getByRole('main')).toContainText('Published audit findings.');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/generated/${slug}$`));

    await sql`UPDATE pages SET visibility = 'restricted' WHERE id = ${pageId}`;
    const privateShare = await page.goto(shareUrl);
    expect(privateShare?.status()).toBe(404);
    await expect(page.getByRole('main')).not.toContainText('Published audit findings.');
  } finally {
    if (pageId) {
      await sql`DELETE FROM page_revisions WHERE page_id = ${pageId}`;
      await sql`DELETE FROM pages WHERE id = ${pageId}`;
    }
    await sql`UPDATE writing_mode_settings SET mode = 'copilot' WHERE id = 'default'`;
    await sql.end({ timeout: 5 });
  }
});
