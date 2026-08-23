import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';

/**
 * The maximized AI pane turns the sidebar into conversation history, and the
 * selected conversation is an address (`?chat=`) rather than tab-local state.
 */

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

/**
 * A captured Raw Conversation, which is what `/api/ai/sessions` lists. Its
 * conversation key — the value that has to survive into the URL — is the Raw
 * page id.
 */
async function seedCapturedConversation(question: string, answer: string): Promise<{ pageId: string }> {
  const sql = database();
  try {
    const [admin] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${ADMIN_EMAIL}`;
    const [space] = await sql<{ id: string }[]>`SELECT id FROM spaces WHERE slug = 'raw'`;
    const [category] = await sql<{ id: string }[]>`
      INSERT INTO raw_categories (name, slug, system_key)
      VALUES ('Conversation', 'conversation', 'conversation')
      ON CONFLICT (system_key) WHERE system_key IS NOT NULL DO UPDATE SET name = EXCLUDED.name
      RETURNING id`;

    const actionId = randomUUID();
    await sql`
      INSERT INTO ai_actions (id, feature, status, actor_user_id, question_mode, expires_at)
      VALUES (${actionId}, 'wiki_question', 'completed', ${admin!.id}, 'full', ${new Date(Date.now() + 86_400_000)})`;

    const path = `conversations/e2e/${Date.now()}`;
    const [page] = await sql<{ id: string }[]>`
      INSERT INTO pages (space_id, slug, path, title, author_id, nature, visibility, raw_category_id)
      VALUES (${space!.id}, ${path.split('/').at(-1)!}, ${path}, ${`Conversation: ${question}`}, ${admin!.id}, 'original', 'restricted', ${category!.id})
      RETURNING id`;

    const contentSource = `# Question\n\n${question}\n\n# Answer\n\n${answer}\n`;
    const sourceMetadata = {
      inputKind: 'chat-transcript',
      sourceType: 'wiki-ai-conversation',
      schemaVersion: 1,
      actionId,
      eventCursor: 3,
      conversationStatus: 'completed',
      questionMode: 'full',
      question,
      answer,
      thinking: '',
      citations: [],
      insufficient: false,
      errorMessage: null,
      queuedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
    const [revision] = await sql<{ id: string }[]>`
      INSERT INTO page_revisions (page_id, version_number, content_type, content_source, content_html, content_hash, author_id, status, actor_kind, source_metadata, published_at)
      VALUES (${page!.id}, 1, 'text/markdown', ${contentSource}, ${`<pre>${contentSource}</pre>`}, ${randomUUID()}, ${admin!.id}, 'published', 'machine', ${sql.json(sourceMetadata)}, now())
      RETURNING id`;
    await sql`
      UPDATE pages SET current_published_version_id = ${revision!.id}, latest_version_id = ${revision!.id} WHERE id = ${page!.id}`;
    await sql`
      UPDATE ai_actions SET raw_conversation_page_id = ${page!.id}, raw_conversation_last_event_id = 3, raw_conversation_capture_status = 'captured' WHERE id = ${actionId}`;

    return { pageId: page!.id };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function clearSeededData() {
  const sql = database();
  try {
    await sql`DELETE FROM ai_actions WHERE feature = 'wiki_question'`;
    await sql`DELETE FROM page_revisions WHERE page_id IN (SELECT id FROM pages WHERE space_id = (SELECT id FROM spaces WHERE slug = 'raw'))`;
    await sql`DELETE FROM page_addresses WHERE page_id IN (SELECT id FROM pages WHERE space_id = (SELECT id FROM spaces WHERE slug = 'raw'))`;
    await sql`DELETE FROM pages WHERE space_id = (SELECT id FROM spaces WHERE slug = 'raw')`;
    await sql`DELETE FROM raw_categories WHERE system_key = 'conversation'`;
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
  const question = 'Which release notes cover the importer?';

  test.beforeEach(async () => {
    await setWritingMode('llm-wiki');
    await setAiEnabled(true);
  });

  test.afterAll(async () => {
    await clearSeededData();
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

  test('selecting a conversation addresses it, and the address reopens it', async ({ page }) => {
    const { pageId } = await seedCapturedConversation(question, 'The 1.4 notes do.');
    await login(page);
    await openMaximizedPane(page);

    await page.getByRole('button', { name: question }).click();
    await expect(page).toHaveURL(new RegExp(`chat=${pageId}`));
    await expect(page.getByText('The 1.4 notes do.')).toBeVisible();

    // The address describes what is on screen: collapsing the pane drops it,
    // reopening the same conversation brings it back.
    const pane = page.locator('aside').filter({ has: page.getByRole('heading', { name: 'Wiki AI' }) });
    await pane.getByRole('button', { name: 'Collapse' }).click();
    await expect(page).not.toHaveURL(/chat=/);
    await page.getByRole('button', { name: 'Ask AI' }).click();
    await expect(page).toHaveURL(new RegExp(`chat=${pageId}`));

    // A new session is not a conversation, so it owns no address. (The history
    // sidebar offers the same action, hence scoping to the pane's own header.)
    await pane.getByRole('button', { name: 'New session' }).click();
    await expect(page).not.toHaveURL(/chat=/);

    // Someone opening the shared address gets that conversation, expanded,
    // with none of this tab's chat state to fall back on.
    const shared = `/?chat=${pageId}`;
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(shared);

    await expect(page.getByText('The 1.4 notes do.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
    await expect(page.locator('[aria-label="Content space"]')).toHaveCount(0);
  });
});
