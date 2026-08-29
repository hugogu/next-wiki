import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import postgres from 'postgres';

/**
 * Proves the existing 039 Agent Memory service — unchanged by this feature —
 * already supports what OpenClaw needs: independent per-key destinations by
 * default, and an explicit shared-destination option at key-creation time
 * when an owner wants two of their own agents to draw on the same memory.
 * Runs serially against the seeded admin account and cleans up its own Raw
 * pages afterward, since other specs wipe the whole raw space and would
 * otherwise fail on the foreign key from agent_memory_records.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'postgresql://wiki:wiki@127.0.0.1:15433/wiki_e2e_test';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';
const PROVIDER_VERSION_HEADER = 'x-next-wiki-memory-provider-version';

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

async function clearAgentMemoryTestData(stamp: number) {
  const sql = database();
  try {
    const marker = `%${stamp}%`;
    const namespaces = await sql<{ id: string }[]>`SELECT id FROM agent_memory_namespaces WHERE display_name LIKE ${marker}`;
    const namespaceIds = namespaces.map((row) => row.id);
    const records = namespaceIds.length
      ? await sql<{ id: string; page_id: string }[]>`SELECT id, page_id FROM agent_memory_records WHERE namespace_id = ANY(${namespaceIds})`
      : [];
    const recordIds = records.map((row) => row.id);
    const pageIds = records.map((row) => row.page_id);

    if (recordIds.length) {
      await sql`DELETE FROM agent_memory_evidence_links WHERE memory_record_id = ANY(${recordIds}) OR evidence_record_id = ANY(${recordIds})`;
      await sql`DELETE FROM agent_memory_records WHERE id = ANY(${recordIds})`;
    }
    if (namespaceIds.length) {
      // Cascades agent_memory_key_bindings via ON DELETE CASCADE from api_keys.
      await sql`DELETE FROM api_keys WHERE id IN (SELECT api_key_id FROM agent_memory_key_bindings WHERE namespace_id = ANY(${namespaceIds}))`;
      await sql`DELETE FROM agent_memory_namespaces WHERE id = ANY(${namespaceIds})`;
    }
    if (pageIds.length) {
      await sql`DELETE FROM page_addresses WHERE page_id = ANY(${pageIds})`;
      await sql`DELETE FROM page_revisions WHERE page_id = ANY(${pageIds})`;
      await sql`DELETE FROM pages WHERE id = ANY(${pageIds})`;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function loginAsAdmin(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill(ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD);
  await page.locator('form').getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
}

type KeyCreated = {
  id: string;
  keySecret: string;
  memoryDestination?: { id: string; displayName: string; agentIdentity: string };
};

async function createMemoryProviderKey(
  request: APIRequestContext,
  name: string,
  agentIdentity: string,
  sharedNamespaceId?: string,
): Promise<KeyCreated> {
  const response = await request.post('/api/api-keys', {
    data: {
      name,
      scopes: ['memory.read', 'memory.write', 'memory.delete'],
      spaceAccess: ['wiki'],
      memoryProvider: sharedNamespaceId
        ? { sharedNamespaceId, agentIdentity }
        : { displayName: name, agentIdentity },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

function memoryHeaders(credential: string) {
  return { Authorization: `Bearer ${credential}`, [PROVIDER_VERSION_HEADER]: 'e2e-test/1.0' };
}

async function saveRecord(request: APIRequestContext, credential: string, content: string): Promise<void> {
  const response = await request.post('/api/v1/memory/records', {
    headers: memoryHeaders(credential),
    data: { idempotencyKey: `e2e-${Date.now()}-${Math.random()}`, content },
  });
  expect(response.status(), await response.text()).toBe(201);
}

async function recall(request: APIRequestContext, credential: string, query: string): Promise<unknown[]> {
  const response = await request.post('/api/v1/memory/recall', {
    headers: memoryHeaders(credential),
    data: { query, limit: 10 },
  });
  expect(response.status(), await response.text()).toBe(200);
  const body = await response.json();
  return body.results ?? body;
}

test.describe('agent memory: Hermes and OpenClaw on the existing 039 service', () => {
  test.beforeAll(async () => {
    await setWritingMode('llm-wiki');
  });

  let stamp: number;

  test.afterAll(async () => {
    await clearAgentMemoryTestData(stamp);
    await setWritingMode('copilot');
  });

  test('two independent keys stay isolated by default; a shared destination lets them share memory', async ({ page }) => {
    await loginAsAdmin(page);
    stamp = Date.now();

    const hermes = await createMemoryProviderKey(page.request, `Hermes ${stamp}`, `hermes-${stamp}`);
    const openclaw = await createMemoryProviderKey(page.request, `OpenClaw ${stamp}`, `openclaw-${stamp}`);
    expect(hermes.memoryDestination?.id).not.toBe(openclaw.memoryDestination?.id);

    const hermesMarker = `hermes-note-${stamp}`;
    const openclawMarker = `openclaw-note-${stamp}`;
    await saveRecord(page.request, hermes.keySecret, hermesMarker);
    await saveRecord(page.request, openclaw.keySecret, openclawMarker);

    await expect.poll(async () => (await recall(page.request, hermes.keySecret, hermesMarker)).length).toBe(1);
    expect(await recall(page.request, openclaw.keySecret, hermesMarker)).toEqual([]);
    expect(await recall(page.request, hermes.keySecret, openclawMarker)).toEqual([]);

    // Sharing a destination alone only groups keys into the same namespace row
    // for administration — recall stays isolated per (namespace, agentIdentity)
    // regardless, so a shared key with a *different* identity still can't see it.
    const openclawSharedDifferentIdentity = await createMemoryProviderKey(
      page.request,
      `OpenClaw shared, different identity ${stamp}`,
      `openclaw-shared-diff-${stamp}`,
      hermes.memoryDestination!.id,
    );
    expect(openclawSharedDifferentIdentity.memoryDestination?.id).toBe(hermes.memoryDestination?.id);
    expect(await recall(page.request, openclawSharedDifferentIdentity.keySecret, hermesMarker)).toEqual([]);

    // Unifying recall requires the *same* agent identity as well.
    const openclawSharedSameIdentity = await createMemoryProviderKey(
      page.request,
      `OpenClaw shared, same identity ${stamp}`,
      hermes.memoryDestination!.agentIdentity,
      hermes.memoryDestination!.id,
    );
    await expect.poll(async () => (await recall(page.request, openclawSharedSameIdentity.keySecret, hermesMarker)).length).toBe(1);
  });
});
