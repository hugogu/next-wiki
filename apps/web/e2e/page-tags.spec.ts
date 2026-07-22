import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { clickSignInSubmit } from './test-helpers';

/**
 * Admin > Pages creates reusable tags through the per-page EditableTagList
 * widget (the "+" adder on each row) rather than a standalone tag-creation
 * form — tags have always been created implicitly by attaching them to a
 * page. This spec seeds its own page so the row is reliably findable via the
 * keyword filter, regardless of what else is in the admin pages list.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'postgresql://wiki:wiki@127.0.0.1:15433/wiki_e2e_test';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';
const TAG_TEST_PATH = 'e2e-page-tags/target';

function database() {
  return postgres(E2E_DATABASE_URL, { max: 1 });
}

async function seedTaggablePage(): Promise<string> {
  const sql = database();
  try {
    const [admin] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${ADMIN_EMAIL}`;
    const [space] = await sql<{ id: string }[]>`SELECT id FROM spaces WHERE slug = 'default'`;
    const source = 'Page used to exercise tag creation from Admin Pages.';
    const [page] = await sql<{ id: string }[]>`
      INSERT INTO pages (space_id, slug, path, title, author_id, nature, visibility)
      VALUES (${space!.id}, 'target', ${TAG_TEST_PATH}, 'Page Tags Target', ${admin!.id}, 'original', 'public')
      ON CONFLICT (space_id, path, locale) DO UPDATE SET title = EXCLUDED.title
      RETURNING id`;
    const hash = createHash('sha256').update(source).digest('hex');
    const [revision] = await sql<{ id: string }[]>`
      INSERT INTO page_revisions (page_id, version_number, content_type, content_source, content_html, content_hash, author_id, status, actor_kind, published_at)
      VALUES (${page!.id}, 1, 'text/markdown', ${source}, ${'<p>page tags target</p>'}, ${hash}, ${admin!.id}, 'published', 'human', now())
      ON CONFLICT (page_id, version_number) DO UPDATE SET content_source = EXCLUDED.content_source
      RETURNING id`;
    await sql`UPDATE pages SET current_published_version_id = ${revision!.id}, latest_version_id = ${revision!.id}, deleted_at = null WHERE id = ${page!.id}`;
    return page!.id;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function clearTaggablePage() {
  const sql = database();
  try {
    await sql`DELETE FROM page_revision_tags WHERE revision_id IN (SELECT id FROM page_revisions WHERE page_id IN (SELECT id FROM pages WHERE path = ${TAG_TEST_PATH}))`;
    await sql`DELETE FROM page_revisions WHERE page_id IN (SELECT id FROM pages WHERE path = ${TAG_TEST_PATH})`;
    await sql`DELETE FROM pages WHERE path = ${TAG_TEST_PATH}`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await clickSignInSubmit(page);
  await page.waitForURL('/');
}

test.describe('page tags', () => {
  test.afterEach(async () => {
    await clearTaggablePage();
  });

  test('allows an administrator to create a reusable tag from page management', async ({ page }) => {
    await seedTaggablePage();
    await login(page);
    await page.goto('/admin/pages?keyword=Page+Tags+Target');

    const row = page.locator('tr', { hasText: 'Page Tags Target' });
    await expect(row).toBeVisible();

    const tagName = `e2e-tag-${Date.now()}`;
    await row.getByLabel('Add tag').click();
    await row.getByLabel('Add tag').fill(tagName);
    await row.getByLabel('Add tag').press('Enter');

    await expect(row.getByText(tagName)).toBeVisible();

    // Persists across a reload — proves the tag was actually saved (and thus
    // registered as a reusable tag), not just held in local component state.
    await page.reload();
    const reloadedRow = page.locator('tr', { hasText: 'Page Tags Target' });
    await expect(reloadedRow.getByText(tagName)).toBeVisible();
  });
});
