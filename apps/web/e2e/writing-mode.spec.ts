import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'postgresql://wiki:wiki@127.0.0.1:15433/wiki_e2e_test';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';
const ONBOARDING_EMAIL = 'writing-mode-owner@example.com';
const ONBOARDING_PASSWORD = 'Password123!';

const RESET_TABLES =
  'setup_progress, ai_generated_artifacts, ai_action_events, ai_action_inputs, ai_actions, ai_knowledge_chunks, ai_page_index_states, ai_index_generations, user_ai_entitlements, ai_purpose_assignments, ai_model_capabilities, ai_models, ai_providers, ai_settings, page_revisions, pages, sessions, users';

async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function setWritingMode(mode: 'copilot' | 'llm-wiki') {
  await withDb(
    (sql) => sql`
      INSERT INTO writing_mode_settings (id, mode, pending_mode, switch_job_id, switch_options, updated_at)
      VALUES ('default', ${mode}, null, null, null, now())
      ON CONFLICT (id) DO UPDATE
      SET mode = EXCLUDED.mode,
          pending_mode = null,
          switch_job_id = null,
          switch_options = null,
          updated_at = EXCLUDED.updated_at
    `,
  );
}

async function resetFirstRunState() {
  await withDb((sql) => sql.unsafe(`TRUNCATE TABLE ${RESET_TABLES} RESTART IDENTITY CASCADE`));
  await setWritingMode('copilot');
}

/** Restore the seeded admin + welcome page so later spec files are unaffected. */
async function restoreSeededState() {
  const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  await withDb(async (sql) => {
    await sql.unsafe(`TRUNCATE TABLE ${RESET_TABLES} RESTART IDENTITY CASCADE`);
    const [admin] = await sql<{ id: string }[]>`
      INSERT INTO users (email, password_hash, role, status, display_name)
      VALUES (${ADMIN_EMAIL}, ${passwordHash}, 'admin', 'active', 'Admin')
      RETURNING id`;
    const [space] = await sql<{ id: string }[]>`SELECT id FROM spaces WHERE slug = 'default' LIMIT 1`;
    const source = '# Welcome to next-wiki\n\nThis is the first published page.\n';
    const [page] = await sql<{ id: string }[]>`
      INSERT INTO pages (space_id, slug, path, title, author_id)
      VALUES (${space!.id}, 'welcome', 'welcome', 'Welcome to next-wiki', ${admin!.id})
      RETURNING id`;
    const hash = createHash('sha256').update(source).digest('hex');
    const [revision] = await sql<{ id: string }[]>`
      INSERT INTO page_revisions (page_id, version_number, content_type, content_source, content_html, content_hash, author_id, status, published_at)
      VALUES (${page!.id}, 1, 'text/markdown', ${source}, '<h1>Welcome to next-wiki</h1><p>This is the first published page.</p>', ${hash}, ${admin!.id}, 'published', now())
      RETURNING id`;
    await sql`UPDATE pages SET current_published_version_id = ${revision!.id}, latest_version_id = ${revision!.id} WHERE id = ${page!.id}`;
  });
  await setWritingMode('copilot');
}

async function login(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.locator('form').getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
}

test.describe('US1: first-run writing-mode selection', () => {
  test.beforeEach(resetFirstRunState);
  test.afterAll(restoreSeededState);

  test('defaults to Copilot but records the chosen LLM Wiki mode', async ({ page }) => {
    await page.goto('/setup');
    await page.getByLabel(/admin email/i).fill(ONBOARDING_EMAIL);
    await page.getByLabel(/password/i).fill(ONBOARDING_PASSWORD);
    await page.getByRole('button', { name: /create admin account/i }).click();
    await page.getByRole('button', { name: /skip ai setup/i }).click();

    // The writing-mode step sits between AI setup and example pages, with
    // Copilot preselected and flagged as recommended.
    await expect(page.getByRole('heading', { name: /choose a writing mode/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/recommended/i)).toBeVisible();
    await expect(page.getByRole('radio', { name: /copilot/i })).toBeChecked();

    // Choosing LLM Wiki advances to the example-pages step.
    await page.getByRole('radio', { name: /llm wiki/i }).check();
    await page.getByRole('button', { name: /^continue$/i }).click();
    await expect(page.getByText(/generate example and help pages/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /skip example pages/i }).click();
    await expect(page.getByText(/setup complete/i)).toBeVisible({ timeout: 15_000 });

    // The created admin session observes the persisted LLM Wiki mode.
    const response = await page.request.get('/api/settings/writing-mode');
    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toMatchObject({ mode: 'llm-wiki', pendingMode: null });
  });
});

test.describe('writing mode administration', () => {
  test.beforeEach(async () => {
    await setWritingMode('copilot');
  });

  test.afterAll(restoreSeededState);

  test('admin can switch forward, confirm a switch back, and observe completion', async ({ page }) => {
    await login(page);
    await page.goto('/admin/writing-mode');

    await expect(page.getByRole('button', { name: 'Switch to LLM Wiki' })).toBeVisible();
    await page.getByRole('button', { name: 'Switch to LLM Wiki' }).click();
    await expect(page.getByRole('button', { name: 'Switch to Copilot' })).toBeVisible();

    await page.getByRole('button', { name: 'Switch to Copilot' }).click();
    await expect(page.getByRole('dialog', { name: 'Switch to Copilot' })).toBeVisible();
    await page.getByLabel('Raw content visibility after migration').selectOption('public');
    await page.getByLabel('Generated content visibility after migration').selectOption('restricted');
    await page.getByRole('button', { name: 'Start migration' }).click();

    await expect.poll(async () => {
      const response = await page.request.get('/api/settings/writing-mode');
      return response.json() as Promise<{ mode: string; pendingMode: string | null }>;
    }).toMatchObject({ mode: 'copilot', pendingMode: null });
    await expect(page.getByText('Migration completed.')).toBeVisible();
  });
});
