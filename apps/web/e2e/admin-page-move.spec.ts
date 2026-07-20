import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import postgres from 'postgres';

/**
 * Admin cross-space page move (LLM Wiki mode). Moves a plain wiki page into the
 * generated space from the admin Pages panel; verifies OKF frontmatter is
 * injected automatically. Restores Copilot mode + clears the moved page after.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'postgresql://wiki:wiki@127.0.0.1:15433/wiki_e2e_test';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';
const MOVE_PATH = 'e2e-move/ai-import';

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

async function seedWikiPage() {
  const sql = database();
  try {
    const [admin] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${ADMIN_EMAIL}`;
    const [space] = await sql<{ id: string }[]>`SELECT id FROM spaces WHERE slug = 'default'`;
    const source = 'This wiki page was actually AI generated.';
    const [page] = await sql<{ id: string }[]>`
      INSERT INTO pages (space_id, slug, path, title, author_id, nature, visibility)
      VALUES (${space!.id}, 'ai-import', ${MOVE_PATH}, 'AI import', ${admin!.id}, 'original', 'public')
      ON CONFLICT (space_id, path, locale) DO UPDATE SET title = EXCLUDED.title
      RETURNING id`;
    const hash = createHash('sha256').update(source).digest('hex');
    const [revision] = await sql<{ id: string }[]>`
      INSERT INTO page_revisions (page_id, version_number, content_type, content_source, content_html, content_hash, author_id, status, actor_kind, published_at)
      VALUES (${page!.id}, 1, 'text/markdown', ${source}, ${'<p>ai</p>'}, ${hash}, ${admin!.id}, 'published', 'human', now())
      ON CONFLICT (page_id, version_number) DO UPDATE SET content_source = EXCLUDED.content_source
      RETURNING id`;
    await sql`UPDATE pages SET current_published_version_id = ${revision!.id}, latest_version_id = ${revision!.id}, deleted_at = null WHERE id = ${page!.id}`;
    return page!.id;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function readMovedPage(pageId: string) {
  const sql = database();
  try {
    const [row] = await sql<{ slug: string; nature: string; visibility: string; source: string }[]>`
      SELECT s.slug, p.nature, p.visibility, r.content_source AS source
      FROM pages p
      JOIN spaces s ON s.id = p.space_id
      JOIN page_revisions r ON r.id = p.current_published_version_id
      WHERE p.id = ${pageId}`;
    return row;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function clearMoved() {
  const sql = database();
  try {
    await sql`DELETE FROM page_revisions WHERE page_id IN (SELECT id FROM pages WHERE path = ${MOVE_PATH})`;
    await sql`DELETE FROM pages WHERE path = ${MOVE_PATH}`;
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

test.describe('admin cross-space page move', () => {
  let pageId: string;

  test.beforeEach(async () => {
    await setWritingMode('llm-wiki');
    pageId = await seedWikiPage();
  });

  test.afterAll(async () => {
    await clearMoved();
    await setWritingMode('copilot');
  });

  test('moves a wiki page into generated and auto-injects OKF frontmatter', async ({ page }) => {
    await login(page);
    await page.goto(`/admin/pages?keyword=${encodeURIComponent('AI import')}`);

    // The LLM-Wiki-only space filter is present.
    await expect(page.getByRole('link', { name: 'Generated', exact: true })).toBeVisible();

    const row = page.getByRole('row', { name: /AI import/ });
    await row.getByRole('button', { name: /move to another space/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Move to Generated/i)).toBeVisible();
    await dialog.getByRole('button', { name: /move page/i }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // The page now lives in generated, admin-only, with injected OKF frontmatter.
    await expect.poll(async () => (await readMovedPage(pageId))?.slug).toBe('generated');
    const moved = await readMovedPage(pageId);
    expect(moved).toMatchObject({ nature: 'generated', visibility: 'restricted' });
    expect(moved.source).toMatch(/^---\ntype: /);
    expect(moved.source).toContain('This wiki page was actually AI generated.');
  });
});
