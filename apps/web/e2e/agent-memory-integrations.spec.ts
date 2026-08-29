import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import postgres from 'postgres';

/**
 * Owner provisioning of independent Agent Memory connections (040), private
 * isolation across them, deliberate shared-promotion grant/revocation, and
 * OpenAPI visibility of the /v1/memory/* contract. Runs serially against the
 * seeded admin account and restores writing mode afterward so later spec
 * files are unaffected (see raw-content.spec.ts for the same convention).
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

async function loginAsAdmin(page: Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill(ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD);
  await page.locator('form').getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
}

type ConnectionCreated = {
  connection: { connectionId: string; displayName: string };
  keyId: string;
  keySecret: string;
};

/** Session-authenticated management call (never callable with a Bearer key). */
async function createConnection(request: APIRequestContext, displayName: string): Promise<ConnectionCreated> {
  const response = await request.post('/api/api-keys/agent-memory/connections', {
    data: { displayName, agentIdentity: `${displayName}-${Date.now()}` },
  });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

function memoryHeaders(credential: string) {
  return { Authorization: `Bearer ${credential}`, [PROVIDER_VERSION_HEADER]: 'e2e-test/1.0' };
}

async function saveRecord(request: APIRequestContext, credential: string, content: string): Promise<string> {
  const response = await request.post('/api/v1/memory/records', {
    headers: memoryHeaders(credential),
    data: { idempotencyKey: `e2e-${Date.now()}-${Math.random()}`, content },
  });
  expect(response.status(), await response.text()).toBe(201);
  const body = await response.json();
  return body.record.memoryId as string;
}

async function recall(
  request: APIRequestContext,
  credential: string,
  query: string,
  scope?: 'own' | 'granted' | 'own_and_granted',
): Promise<Array<{ memoryId: string }>> {
  const response = await request.post('/api/v1/memory/recall', {
    headers: memoryHeaders(credential),
    data: { query, limit: 10, ...(scope ? { scope } : {}) },
  });
  expect(response.status(), await response.text()).toBe(200);
  const body = await response.json();
  return body.results;
}

test.describe('agent memory integrations (040)', () => {
  test.beforeAll(async () => {
    await setWritingMode('llm-wiki');
  });

  test.afterAll(async () => {
    await setWritingMode('copilot');
  });

  test('owner provisions three independent connections with private isolation, deliberate sharing, and OpenAPI visibility', async ({ page }) => {
    await loginAsAdmin(page);
    const stamp = Date.now();

    // --- Owner provisioning: three independent adapter credentials. ---
    const hermes = await createConnection(page.request, `Hermes ${stamp}`);
    const openclawA = await createConnection(page.request, `OpenClaw A ${stamp}`);
    const openclawB = await createConnection(page.request, `OpenClaw B ${stamp}`);
    expect(new Set([hermes.keyId, openclawA.keyId, openclawB.keyId]).size).toBe(3);

    for (const created of [hermes, openclawA, openclawB]) {
      const connectionInfo = await page.request.get('/api/v1/memory/connection', {
        headers: memoryHeaders(created.keySecret),
      });
      expect(connectionInfo.status(), await connectionInfo.text()).toBe(200);
      const body = await connectionInfo.json();
      expect(body.keySecret).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain(created.keySecret);
    }

    // --- Private isolation: a save through one connection is invisible to the others. ---
    const hermesMarker = `hermes-private-note-${stamp}`;
    const openclawAMarker = `openclaw-a-private-note-${stamp}`;
    const openclawBMarker = `openclaw-b-private-note-${stamp}`;

    const hermesMemoryId = await saveRecord(page.request, hermes.keySecret, hermesMarker);
    const openclawAMemoryId = await saveRecord(page.request, openclawA.keySecret, openclawAMarker);
    await saveRecord(page.request, openclawB.keySecret, openclawBMarker);

    await expect
      .poll(async () => (await recall(page.request, hermes.keySecret, hermesMarker)).map((r) => r.memoryId))
      .toContain(hermesMemoryId);
    expect(await recall(page.request, openclawA.keySecret, hermesMarker)).toEqual([]);
    expect(await recall(page.request, openclawB.keySecret, hermesMarker)).toEqual([]);

    expect(await recall(page.request, hermes.keySecret, openclawAMarker)).toEqual([]);
    expect(await recall(page.request, hermes.keySecret, openclawBMarker)).toEqual([]);
    expect(await recall(page.request, openclawA.keySecret, openclawBMarker)).toEqual([]);

    // --- Deliberate shared-promotion grant/revocation. ---
    const destResponse = await page.request.post('/api/api-keys/agent-memory/shared-destinations', {
      data: { displayName: `Team knowledge ${stamp}` },
    });
    expect(destResponse.status(), await destResponse.text()).toBe(201);
    const destination = await destResponse.json();

    const promoteResponse = await page.request.post('/api/api-keys/agent-memory/promotions', {
      data: { sourceRecordId: openclawAMemoryId, destinationId: destination.id },
    });
    expect(promoteResponse.status(), await promoteResponse.text()).toBe(201);
    const promoted = await promoteResponse.json();
    expect(promoted.record.memoryId).not.toBe(openclawAMemoryId);

    const grantResponse = await page.request.post(
      `/api/api-keys/agent-memory/connections/${openclawB.connection.connectionId}/read-grants`,
      { data: { destinationId: destination.id } },
    );
    expect(grantResponse.status(), await grantResponse.text()).toBe(201);
    const grant = await grantResponse.json();

    await expect
      .poll(async () => (await recall(page.request, openclawB.keySecret, openclawAMarker, 'granted')).map((r) => r.memoryId))
      .toContain(promoted.record.memoryId);

    // The source connection's own recall is unaffected by the promotion.
    expect(await recall(page.request, openclawA.keySecret, openclawAMarker, 'own')).toEqual(
      expect.arrayContaining([expect.objectContaining({ memoryId: openclawAMemoryId })]),
    );

    const revokeResponse = await page.request.delete(
      `/api/api-keys/agent-memory/connections/${openclawB.connection.connectionId}/read-grants/${grant.grantId}`,
    );
    expect(revokeResponse.status()).toBe(204);

    await expect
      .poll(async () => recall(page.request, openclawB.keySecret, openclawAMarker, 'granted'))
      .toEqual([]);

    // A non-owner (agent) credential can never create its own grant or promotion.
    const forbiddenGrant = await page.request.post(
      `/api/api-keys/agent-memory/connections/${openclawB.connection.connectionId}/read-grants`,
      { headers: memoryHeaders(openclawB.keySecret), data: { destinationId: destination.id } },
    );
    expect(forbiddenGrant.status()).toBe(403);

    // --- OpenAPI visibility. ---
    const openapiResponse = await page.request.get('/api/openapi.json');
    expect(openapiResponse.status()).toBe(200);
    const openapi = await openapiResponse.json();
    expect(openapi.paths['/v1/memory/records'].post).toBeDefined();
    expect(openapi.paths['/v1/memory/recall'].post).toBeDefined();
    expect(openapi.paths['/v1/memory/connection'].get).toBeDefined();
    expect(openapi.components.schemas.AgentMemorySaveInput).toBeDefined();
    expect(openapi.components.schemas.AgentMemoryRecallInput).toBeDefined();
    expect(openapi.components.schemas.AgentMemoryDestinationGrant).toBeDefined();

    const publicOpenapiResponse = await page.request.get('/api/public-openapi.json');
    expect(publicOpenapiResponse.status()).toBe(200);
    const publicOpenapi = await publicOpenapiResponse.json();
    expect(publicOpenapi.paths['/v1/memory/recall']).toBeDefined();
    expect(publicOpenapi.paths['/v1/memory/records']).toBeDefined();
    // Owner-management routes are session-only and never published to agents.
    expect(publicOpenapi.paths['/api-keys/agent-memory/connections']).toBeUndefined();
  });
});
