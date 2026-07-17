import { test, expect, type Browser, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';

/**
 * First-run onboarding E2E coverage (021).
 *
 * The default E2E environment seeds a demo admin, which closes /setup. These
 * tests truncate the user/setup tables to reach the true first-run state and
 * restore the seeded admin afterwards so later spec files are unaffected.
 *
 * OpenRouter traffic is served by a local fixture on 127.0.0.1:31987 (wired
 * via OPENROUTER_BASE_URL in playwright.config.ts), so no external network is
 * required.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'postgresql://wiki:wiki@127.0.0.1:15433/wiki_e2e_test';
const FIXTURE_PORT = 31_987;
const FIXTURE_KEY = 'e2e-openrouter-key';
const ADMIN_EMAIL = 'owner@example.com';
const ADMIN_PASSWORD = 'Password123!';

async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function resetFirstRunState() {
  await withDb((sql) =>
    sql.unsafe(
      'TRUNCATE TABLE setup_progress, ai_generated_artifacts, ai_action_events, ai_action_inputs, ai_actions, ai_knowledge_chunks, ai_page_index_states, ai_index_generations, user_ai_entitlements, ai_purpose_assignments, ai_model_capabilities, ai_models, ai_providers, ai_settings, page_revisions, pages, sessions, users RESTART IDENTITY CASCADE',
    ),
  );
}

async function restoreSeededState() {
  const passwordHash = bcrypt.hashSync('admin123', 10);
  await withDb(async (sql) => {
    await sql.unsafe(
      'TRUNCATE TABLE setup_progress, ai_generated_artifacts, ai_action_events, ai_action_inputs, ai_actions, ai_knowledge_chunks, ai_page_index_states, ai_index_generations, user_ai_entitlements, ai_purpose_assignments, ai_model_capabilities, ai_models, ai_providers, ai_settings, page_revisions, pages, sessions, users RESTART IDENTITY CASCADE',
    );
    const [admin] = await sql<{ id: string }[]>`
      INSERT INTO users (email, password_hash, role, status, display_name)
      VALUES ('admin@example.com', ${passwordHash}, 'admin', 'active', 'Admin')
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
}

async function insertUserAuthoredPage(path: string, title: string, source: string) {
  await withDb(async (sql) => {
    const [admin] = await sql<{ id: string }[]>`SELECT id FROM users WHERE role = 'admin' LIMIT 1`;
    const [space] = await sql<{ id: string }[]>`SELECT id FROM spaces WHERE slug = 'default' LIMIT 1`;
    const slug = path.split('/').pop()!;
    const [page] = await sql<{ id: string }[]>`
      INSERT INTO pages (space_id, slug, path, title, author_id)
      VALUES (${space!.id}, ${slug}, ${path}, ${title}, ${admin!.id})
      RETURNING id`;
    const hash = createHash('sha256').update(source).digest('hex');
    const [revision] = await sql<{ id: string }[]>`
      INSERT INTO page_revisions (page_id, version_number, content_type, content_source, content_html, content_hash, author_id, status, published_at)
      VALUES (${page!.id}, 1, 'text/markdown', ${source}, ${`<p>${source}</p>`}, ${hash}, ${admin!.id}, 'published', now())
      RETURNING id`;
    await sql`UPDATE pages SET current_published_version_id = ${revision!.id}, latest_version_id = ${revision!.id} WHERE id = ${page!.id}`;
  });
}

async function startOpenRouterFixture(): Promise<Server> {
  const server = createServer((request, response) => {
    const json = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (request.headers.authorization !== `Bearer ${FIXTURE_KEY}`) {
      json(401, { error: { message: 'invalid key' } });
      return;
    }
    const url = request.url ?? '/';
    if (url.startsWith('/embeddings/models')) {
      json(200, {
        data: [
          {
            id: 'fixture/embed',
            name: 'Fixture Embedding',
            embedding_dimensions: 3,
            architecture: { input_modalities: ['text'], output_modalities: ['embeddings'] },
          },
          {
            id: 'perplexity/pplx-embed-v1-0.6b',
            name: 'PPLX Embed v1 0.6B',
            embedding_dimensions: 1024,
            architecture: { input_modalities: ['text'], output_modalities: ['embeddings'] },
          },
        ],
      });
      return;
    }
    if (url.startsWith('/models')) {
      json(200, {
        data: [
          {
            id: 'fixture/text',
            name: 'Fixture Text',
            context_length: 32_000,
            architecture: { input_modalities: ['text'], output_modalities: ['text'] },
          },
          {
            id: 'fixture/text:free',
            name: 'Fixture Text Free',
            context_length: 32_000,
            architecture: { input_modalities: ['text'], output_modalities: ['text'] },
          },
          {
            id: 'fixture/image',
            name: 'Fixture Image',
            architecture: { input_modalities: ['text'], output_modalities: ['image'] },
          },
        ],
      });
      return;
    }
    if (url.startsWith('/embeddings') && request.method === 'POST') {
      let raw = '';
      request.on('data', (chunk) => (raw += chunk));
      request.on('end', () => {
        const body = JSON.parse(raw || '{}');
        const inputs = Array.isArray(body.input) ? body.input : [body.input];
        json(200, {
          data: inputs.map((_: unknown, index: number) => ({
            index,
            embedding: Array.from({ length: 1024 }, (_v, i) => ((i + index) % 10) / 10),
          })),
          usage: { prompt_tokens: inputs.length },
        });
      });
      return;
    }
    json(404, { error: { message: 'not found' } });
  });
  server.listen(FIXTURE_PORT, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

async function completeAccountStep(page: Page) {
  await page.goto('/setup');
  await expect(page.getByLabel(/admin email/i)).toBeVisible();
  await page.getByLabel(/admin email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /create admin account/i }).click();
  await expect(page.getByText(/set up ai with openrouter/i)).toBeVisible({ timeout: 15_000 });
}

let fixture: Server;

test.beforeAll(async () => {
  fixture = await startOpenRouterFixture();
});

test.afterAll(async () => {
  await restoreSeededState();
  fixture.close();
  await once(fixture, 'close');
});

test.describe('US1: first admin account', () => {
  test.beforeEach(resetFirstRunState);

  test('creates the first admin, resumes on refresh, and denies a second browser', async ({
    page,
    browser,
  }) => {
    await completeAccountStep(page);

    // Refresh resumes at the AI step (no duplicate account form).
    await page.reload();
    await expect(page.getByText(/set up ai with openrouter/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel(/admin email/i)).toHaveCount(0);

    // A second browser cannot create another admin.
    const second = await browser.newContext();
    try {
      const other = await second.newPage();
      const response = await other.request.post('/api/auth/setup', {
        data: { email: 'second@example.com', password: 'Password123!' },
      });
      expect(response.status()).toBe(403);
      // Anonymous /setup now redirects away from the account form.
      await other.goto('/setup');
      await expect(other).toHaveURL(/\/$/);
    } finally {
      await second.close();
    }
  });
});

test.describe('US2/US3: skip AI and skip examples', () => {
  test.beforeEach(resetFirstRunState);

  test('skip AI then skip examples lands on a summary with manual links', async ({ page }) => {
    await completeAccountStep(page);

    await page.getByRole('button', { name: /skip ai setup/i }).click();
    await expect(page.getByText(/generate example and help pages/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /skip example pages/i }).click();
    await expect(page.getByText(/setup complete/i)).toBeVisible({ timeout: 15_000 });

    // Summary shows skipped statuses and the manual AI-settings path.
    await expect(page.getByText(/admin account created/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /open admin ai settings/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /go to wiki home/i })).toBeVisible();

    // Declined help pages do not exist.
    const helpResponse = await page.request.get('/help/markdown-syntax');
    expect(helpResponse.status()).toBe(404);

    // Wiki home is reachable through the summary.
    await page.getByRole('button', { name: /go to wiki home/i }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('US3: generate examples', () => {
  test.beforeEach(resetFirstRunState);

  test('generates published pages, links, and anonymous reads; reports collisions', async ({
    page,
    browser,
  }) => {
    await completeAccountStep(page);
    await page.getByRole('button', { name: /skip ai setup/i }).click();
    await expect(page.getByText(/generate example and help pages/i)).toBeVisible({ timeout: 15_000 });

    // A user-authored page at a canonical help path is never overwritten.
    await insertUserAuthoredPage('help/markdown-syntax', 'My markdown notes', 'User notes');

    await page.getByRole('button', { name: /generate example pages/i }).click();
    await expect(page.getByText(/setup complete/i)).toBeVisible({ timeout: 20_000 });

    // Collision is reported; other pages were created.
    await expect(page.getByText(/help\/markdown-syntax/).first()).toBeVisible();
    await expect(page.getByText(/skipped \(already exists\)/i)).toBeVisible();
    await expect(page.getByRole('link', { name: 'help/main-features' })).toBeVisible();

    // Generated pages render through normal wiki navigation, anonymously too.
    const anon = await browser.newContext();
    try {
      const reader = await anon.newPage();
      await reader.goto('/welcome');
      await expect(reader.getByRole('heading', { name: /welcome to next-wiki/i })).toBeVisible();
      await expect(reader.getByRole('link', { name: /main features guide/i }).first()).toBeVisible();

      await reader.goto('/help/main-features');
      await expect(reader.getByRole('heading', { name: /main features guide/i })).toBeVisible();

      // The colliding page keeps its user-authored content.
      await reader.goto('/help/markdown-syntax');
      await expect(reader.getByText(/user notes/i)).toBeVisible();
    } finally {
      await anon.close();
    }
  });

  test('declining examples creates no optional help pages', async ({ page }) => {
    await completeAccountStep(page);
    await page.getByRole('button', { name: /skip ai setup/i }).click();
    await expect(page.getByText(/generate example and help pages/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /skip example pages/i }).click();
    await expect(page.getByText(/setup complete/i)).toBeVisible({ timeout: 15_000 });

    // Assert at the database level: earlier tests may have published these
    // paths and the public ISR cache legitimately serves them until the next
    // publish invalidates it.
    const rows = await withDb((sql) =>
      sql<{ path: string }[]>`SELECT path FROM pages WHERE path IN ('help/main-features', 'help/markdown-syntax')`,
    );
    expect(rows).toEqual([]);
  });
});

test.describe('US2: OpenRouter bootstrap', () => {
  test.beforeEach(resetFirstRunState);

  test('configures AI with a valid key through background sync to the summary', async ({ page }) => {
    test.setTimeout(240_000);
    await completeAccountStep(page);

    await page.getByLabel(/openrouter api key/i).fill(FIXTURE_KEY);
    await page.getByRole('button', { name: /validate and set up ai/i }).click();

    // Queued progress appears while the background model sync runs.
    await expect(page.getByText(/detecting models in the background|syncing models/i)).toBeVisible({
      timeout: 15_000,
    });

    // Terminal bootstrap advances to the sample-pages step; per-purpose
    // results are summarized at the end.
    await expect(page.getByText(/generate example and help pages/i)).toBeVisible({ timeout: 180_000 });

    // Refresh resumes safely at the same step (no duplicate submit).
    await page.reload();
    await expect(page.getByText(/generate example and help pages/i)).toBeVisible({ timeout: 60_000 });

    await page.getByRole('button', { name: /skip example pages/i }).click();
    await expect(page.getByText(/setup complete/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/chat \/ wiki answers/i)).toBeVisible();
    // The free chat model and the preferred Perplexity embedding win auto-assign.
    await expect(page.getByText(/fixture text free/i)).toBeVisible();
    await expect(page.getByText(/pplx embed v1 0.6b/i)).toBeVisible();
  });

  test('rejects an invalid key with a safe retryable error', async ({ page }) => {
    test.setTimeout(180_000);
    await completeAccountStep(page);

    await page.getByLabel(/openrouter api key/i).fill('wrong-key');
    await page.getByRole('button', { name: /validate and set up ai/i }).click();
    await expect(page.getByText(/could not be validated/i)).toBeVisible({ timeout: 30_000 });

    // The admin account survives and retry with a valid key works.
    await page.getByLabel(/openrouter api key/i).fill(FIXTURE_KEY);
    await page.getByRole('button', { name: /retry|validate and set up ai/i }).click();
    await expect(page.getByText(/detecting models in the background|syncing models|generate example and help pages/i)).toBeVisible({
      timeout: 120_000,
    });
  });
});
