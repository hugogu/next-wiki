import { test, expect, type Page } from '@playwright/test';
import postgres from 'postgres';

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'postgresql://wiki:wiki@127.0.0.1:15433/wiki_e2e_test';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function setWritingMode(mode: 'copilot' | 'llm-wiki') {
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  try {
    await sql`
      INSERT INTO writing_mode_settings (id, mode, pending_mode, switch_job_id, switch_options, updated_at)
      VALUES ('default', ${mode}, null, null, null, now())
      ON CONFLICT (id) DO UPDATE
      SET mode = EXCLUDED.mode,
          pending_mode = null,
          switch_job_id = null,
          switch_options = null,
          updated_at = EXCLUDED.updated_at
    `;
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

test.describe('writing mode administration', () => {
  test.beforeEach(async () => {
    await setWritingMode('copilot');
  });

  test.afterAll(async () => {
    await setWritingMode('copilot');
  });

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
