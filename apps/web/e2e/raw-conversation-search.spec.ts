import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { clickSignInSubmit } from './test-helpers';

/**
 * Raw Conversation Search (023): Admin data-source toggle, the shared
 * conversation reader for a captured Raw page, immutable AI Chat History
 * delete semantics, space-aware search, and Raw permission enforcement.
 *
 * A live LLM provider is never configured in this environment (see
 * ai-curation-search.spec.ts), so the actual capture pipeline (worker +
 * provider streaming) cannot run end-to-end here. Instead, a captured
 * conversation is seeded directly at the row/page level — exactly what
 * `captureConversation` would have produced — so the reader, history, and
 * search surfaces can be exercised the same way raw-content.spec.ts seeds
 * raw entries directly rather than driving the full write path.
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

async function setDataSourceEnabled(enabled: boolean) {
  const sql = database();
  try {
    await sql`
      INSERT INTO content_data_source_settings (source_key, enabled)
      VALUES ('ai-conversations', ${enabled})
      ON CONFLICT (source_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

type SeededConversation = { path: string; actionId: string; pageId: string };

/** Seeds a fully captured Raw Conversation: the built-in category, an
 * ai_actions row pointing at a Raw page, and a published revision whose
 * `source_metadata` is a valid schemaVersion-1 conversation snapshot — the
 * same shape `captureConversation` writes. */
async function seedCapturedConversation(question: string, answer: string): Promise<SeededConversation> {
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
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await sql`
      INSERT INTO ai_actions (id, feature, status, actor_user_id, question_mode, expires_at)
      VALUES (${actionId}, 'wiki_question', 'completed', ${admin!.id}, 'full', ${expiresAt})`;

    const timestamp = Date.now();
    const path = `conversations/e2e/${timestamp}`;
    const slug = path.split('/').at(-1)!;
    const [page] = await sql<{ id: string }[]>`
      INSERT INTO pages (space_id, slug, path, title, author_id, nature, visibility, raw_category_id)
      VALUES (${space!.id}, ${slug}, ${path}, ${`Conversation: ${question}`}, ${admin!.id}, 'original', 'restricted', ${category!.id})
      RETURNING id`;

    const contentSource = `# Question\n\n${question}\n\n# Answer\n\n${answer}\n\nStatus: completed`;
    const hash = randomUUID();
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
      VALUES (${page!.id}, 1, 'text/markdown', ${contentSource}, ${`<pre>${contentSource}</pre>`}, ${hash}, ${admin!.id}, 'published', 'machine', ${sql.json(sourceMetadata)}, now())
      RETURNING id`;
    await sql`
      UPDATE pages SET current_published_version_id = ${revision!.id}, latest_version_id = ${revision!.id} WHERE id = ${page!.id}`;
    await sql`
      UPDATE ai_actions SET raw_conversation_page_id = ${page!.id}, raw_conversation_last_event_id = 3, raw_conversation_capture_status = 'captured' WHERE id = ${actionId}`;

    return { path, actionId, pageId: page!.id };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function clearSeededData() {
  const sql = database();
  try {
    await sql`DELETE FROM ai_actions WHERE feature = 'wiki_question'`;
    await sql`DELETE FROM page_revisions WHERE page_id IN (SELECT id FROM pages WHERE space_id = (SELECT id FROM spaces WHERE slug = 'raw'))`;
    await sql`DELETE FROM pages WHERE space_id = (SELECT id FROM spaces WHERE slug = 'raw')`;
    await sql`DELETE FROM raw_categories WHERE system_key = 'conversation'`;
    await sql`DELETE FROM content_data_source_settings WHERE source_key IN ('ai-conversations', 'wiki-ai-conversations')`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function login(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await clickSignInSubmit(page);
  await page.waitForURL('/');
}

async function registerReader(page: Page, email: string) {
  await page.goto('/auth/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('/');
}

test.describe('Raw Conversation Search (023)', () => {
  test.beforeEach(async () => {
    await setWritingMode('llm-wiki');
  });

  test.afterEach(async () => {
    await clearSeededData();
    await setWritingMode('copilot');
  });

  test('admin toggles the AI Conversations data source from Bots General', async ({ page }) => {
    await login(page);
    await page.goto('/admin/bots?tab=general');

    await expect(page.getByText('AI Conversations')).toBeVisible();
    const toggle = page.getByRole('switch', { name: 'AI Conversations' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await page.reload();
    await expect(page.getByRole('switch', { name: 'AI Conversations' })).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('switch', { name: 'AI Conversations' }).click();
    await expect(page.getByRole('switch', { name: 'AI Conversations' })).toHaveAttribute('aria-checked', 'false');
  });

  test('the former Content settings location redirects to Bots General instead of duplicating the editor', async ({ page }) => {
    await login(page);
    await page.goto('/admin/content');
    await page.waitForURL('**/admin/bots?tab=general');
    await expect(page.getByText('AI Conversations')).toBeVisible();
  });

  test('a captured conversation renders via the shared conversation view and cannot be deleted from history', async ({ page }) => {
    const question = 'Where does the deployment config live?';
    const answer = 'It lives in docker-compose.yml at the repository root.';
    const seeded = await seedCapturedConversation(question, answer);
    await login(page);

    // The Raw page dispatches to ConversationSessionView, not a generic dump.
    await page.goto(`/spaces/raw/${seeded.path}`);
    const article = page.getByTestId('space-page-reader');
    await expect(article.getByText(question)).toBeVisible();
    await expect(article.getByText(answer)).toBeVisible();
    await expect(page.locator('[data-testid="raw-content"]')).toHaveCount(0);

    // The status badge sits next to the breadcrumb (rendered once, not
    // duplicated on its own line above the question).
    const breadcrumb = page.getByRole('navigation', { name: /breadcrumb/i });
    await expect(breadcrumb.getByText('Completed')).toBeVisible();
    await expect(page.getByText('Completed', { exact: true })).toHaveCount(1);

    // AI Chat History lists the captured session with an immutable delete.
    await page.goto('/user-center/ai-sessions');
    const row = page.getByRole('row', { name: new RegExp(question) });
    await expect(row).toBeVisible();
    const deleteButton = row.getByRole('button', { name: /captured as raw evidence|delete/i });
    await expect(deleteButton).toBeDisabled();
    const openRawLink = row.getByRole('link', { name: /open raw page/i });
    await expect(openRawLink).toHaveAttribute('href', `/spaces/raw/${seeded.path}`);
  });

  test('the header search box (no explicit space) still surfaces a captured conversation', async ({ page }) => {
    const uniqueTerm = `moearchitecture${Date.now()}`;
    const seeded = await seedCapturedConversation(`What is ${uniqueTerm}?`, `${uniqueTerm} is a mixture-of-experts design.`);
    await login(page);

    // This is exactly what HeaderHybridSearch.tsx sends — no `space` field.
    const search = await page.request.post('/api/v1/search/pages', {
      data: { kind: 'query', searchRecordId: randomUUID(), searchSessionId: randomUUID(), q: uniqueTerm, limit: 20 },
    });
    expect(search.ok()).toBe(true);
    const body = await search.json();
    const hit = body.items.find((item: { page: { path: string } }) => item.page.path === seeded.path);
    expect(hit).toBeTruthy();
    expect(hit.page.spaceSlug).toBe('raw');
  });

  test('an Admin can find a captured conversation via Raw-space search and open it', async ({ page }) => {
    const uniqueTerm = `capturemarker${Date.now()}`;
    const seeded = await seedCapturedConversation(`What is ${uniqueTerm}?`, `${uniqueTerm} is a unique deployment marker.`);
    await login(page);

    const search = await page.request.post('/api/v1/search/pages', {
      data: { kind: 'query', searchRecordId: randomUUID(), searchSessionId: randomUUID(), q: uniqueTerm, space: 'raw' },
    });
    expect(search.ok()).toBe(true);
    const body = await search.json();
    const hit = body.items.find((item: { page: { path: string } }) => item.page.path === seeded.path);
    expect(hit).toBeTruthy();
    expect(hit.page.rawCategorySystemKey).toBe('conversation');
    expect(hit.page.spaceSlug).toBe('raw');

    await page.goto(`/spaces/raw/${hit.page.path}`);
    await expect(page.getByText(`${uniqueTerm} is a unique deployment marker.`)).toBeVisible();
  });

  test('a non-Admin cannot discover or open a captured conversation', async ({ page, browser }) => {
    const uniqueTerm = `readerdenied${Date.now()}`;
    const seeded = await seedCapturedConversation(`What is ${uniqueTerm}?`, `${uniqueTerm} answer text.`);

    const readerContext = await browser.newContext();
    const readerPage = await readerContext.newPage();
    await registerReader(readerPage, `raw-search-reader-${Date.now()}@example.com`);

    const search = await readerPage.request.post('/api/v1/search/pages', {
      data: { kind: 'query', searchRecordId: randomUUID(), searchSessionId: randomUUID(), q: uniqueTerm, space: 'raw' },
    });
    // Either forbidden outright, or accepted with zero disclosed results —
    // never a readable Raw Conversation candidate for a non-Admin.
    if (search.ok()) {
      const body = await search.json();
      expect(body.items).toHaveLength(0);
    } else {
      expect(search.status()).toBe(403);
    }

    await readerPage.goto(`/spaces/raw/${seeded.path}`);
    await expect(readerPage.locator('h1:has-text("404")')).toBeVisible();

    await readerContext.close();
  });
});
