import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import postgres from 'postgres';

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'postgresql://wiki:wiki@127.0.0.1:15433/wiki_e2e_test';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

function database() {
  return postgres(E2E_DATABASE_URL, { max: 1 });
}

async function setWritingMode(mode: 'copilot' | 'llm-wiki') {
  const sql = database();
  try {
    await sql`
      INSERT INTO writing_mode_settings (id, mode, updated_at)
      VALUES ('default', ${mode}, now())
      ON CONFLICT (id) DO UPDATE SET mode = EXCLUDED.mode, updated_at = EXCLUDED.updated_at
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function seedPrivatePage(spaceSlug: 'raw' | 'generated', path: string, title: string, source: string) {
  const sql = database();
  try {
    const [admin] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${ADMIN_EMAIL}`;
    const [space] = await sql<{ id: string }[]>`SELECT id FROM spaces WHERE slug = ${spaceSlug}`;
    const slug = path.split('/').at(-1)!;
    const [page] = await sql<{ id: string }[]>`
      INSERT INTO pages (space_id, slug, path, title, author_id, nature, visibility)
      VALUES (${space!.id}, ${slug}, ${path}, ${title}, ${admin!.id}, ${spaceSlug === 'raw' ? 'original' : 'generated'}, 'restricted')
      ON CONFLICT (space_id, path, locale) DO UPDATE SET title = EXCLUDED.title
      RETURNING id
    `;
    const hash = createHash('sha256').update(source).digest('hex');
    const [revision] = await sql<{ id: string }[]>`
      INSERT INTO page_revisions (page_id, version_number, content_type, content_source, content_html, content_hash, author_id, status, actor_kind, published_at)
      VALUES (${page!.id}, 1, 'text/markdown', ${source}, ${`<h1>${title}</h1>`}, ${hash}, ${admin!.id}, 'published', 'machine', now())
      ON CONFLICT (page_id, version_number) DO UPDATE SET content_source = EXCLUDED.content_source, content_html = EXCLUDED.content_html
      RETURNING id
    `;
    await sql`
      UPDATE pages
      SET current_published_version_id = ${revision!.id}, latest_version_id = ${revision!.id}, deleted_at = null
      WHERE id = ${page!.id}
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function setRole(email: string, role: 'editor') {
  const sql = database();
  try {
    await sql`UPDATE users SET role = ${role} WHERE email = ${email}`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.locator('form').getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
}

async function register(page: Page, email: string) {
  await page.goto('/auth/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('/');
}

test.describe('LLM Wiki space navigation', () => {
  test.beforeEach(async () => {
    await setWritingMode('llm-wiki');
    await seedPrivatePage('generated', 'e2e/generated', 'Generated E2E page', '# Generated E2E page');
    await seedPrivatePage('raw', 'e2e/raw', 'Raw E2E page', '# Raw E2E page');
  });

  test.afterAll(async () => {
    await setWritingMode('copilot');
  });

  test('admin switches spaces and sees route-derived breadcrumbs', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const modeResponse = await page.request.get('/api/settings/writing-mode');
    expect(modeResponse.ok()).toBe(true);
    await expect(modeResponse.json()).resolves.toMatchObject({ mode: 'llm-wiki' });
    const switcher = page.locator('[aria-label="Content space"]');
    await expect(switcher).toBeVisible();
    await switcher.getByRole('link', { name: 'Generated' }).click();
    await page.waitForURL('/spaces/generated');

    await page.goto('/spaces/generated/e2e/generated');
    const breadcrumbs = page.locator('nav[aria-label="Breadcrumbs"]');
    await expect(breadcrumbs.getByRole('link', { name: 'Generated' })).toHaveAttribute('href', '/spaces/generated');
    await expect(breadcrumbs.getByRole('link', { name: 'e2e' })).toHaveAttribute('href', '/spaces/generated/e2e');
    await expect(breadcrumbs.getByText('generated', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Generated E2E page' })).toBeVisible();

    await switcher.getByRole('link', { name: 'Raw' }).click();
    await page.waitForURL('/spaces/raw');
  });

  test('editor has no switcher and cannot read a private space route', async ({ page }) => {
    const email = `spaces-editor-${Date.now()}@example.com`;
    await register(page, email);
    await setRole(email, 'editor');

    await page.goto('/');
    await expect(page.locator('[aria-label="Content space"]')).toHaveCount(0);
    await page.goto('/spaces/raw/e2e/raw');
    await expect(page.locator('h1:has-text("404")')).toBeVisible();
  });

  test('Copilot mode hides the switcher', async ({ page }) => {
    await setWritingMode('copilot');
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page.locator('[aria-label="Content space"]')).toHaveCount(0);
  });
});
