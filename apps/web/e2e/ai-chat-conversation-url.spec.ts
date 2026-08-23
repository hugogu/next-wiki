import { test, expect, type Page } from '@playwright/test';
import postgres from 'postgres';

/** The maximized AI pane turns the sidebar into conversation history. */

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
      ON CONFLICT (id) DO UPDATE SET mode = EXCLUDED.mode, pending_mode = null, switch_job_id = null, updated_at = now()`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** The pane only mounts for an AI-enabled instance; an admin is entitled by default. */
async function setAiEnabled(enabled: boolean) {
  const sql = database();
  try {
    await sql`
      INSERT INTO ai_settings (id, enabled)
      VALUES ('default', ${enabled})
      ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`;
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

async function openMaximizedPane(page: Page) {
  await page.getByRole('button', { name: 'Ask AI' }).click();
  await page.getByRole('button', { name: 'Maximize' }).click();
}

test.describe('AI pane conversation addressing', () => {
  test.beforeEach(async () => {
    await setWritingMode('llm-wiki');
    await setAiEnabled(true);
  });

  test.afterAll(async () => {
    await setAiEnabled(false);
    await setWritingMode('copilot');
  });

  test('the maximized pane replaces the space tabs with conversation history', async ({ page }) => {
    await login(page);
    await expect(page.locator('[aria-label="Content space"]')).toBeVisible();

    await openMaximizedPane(page);

    await expect(page.locator('[aria-label="Content space"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.locator('[aria-label="Content space"]')).toBeVisible();
  });
});
