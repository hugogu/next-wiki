import { eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { seedDefaultStorageBackend } from '@/server/seed';

export const SETUP_ADMIN_EMAIL = 'setup-admin@example.com';
export const SETUP_ADMIN_PASSWORD = 'SetupPassword123!';
export const OPENROUTER_FIXTURE_KEY = 'test-key';

/**
 * FK-safe full reset between onboarding test scenarios. Mirrors the global
 * teardown truncate list (plus setup_progress) so no residue from this suite
 * — or from earlier files in the shared single-fork run — can violate foreign
 * keys when a later file deletes rows in its own beforeAll order.
 */
export async function resetSetupOnboardingState(): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE ai_generated_artifacts, ai_action_events, ai_action_inputs, ai_actions, ai_knowledge_chunks, ai_page_index_states, ai_index_generations, user_ai_entitlements, ai_purpose_assignments, ai_model_capabilities, ai_models, ai_providers, ai_settings, setup_progress, writing_mode_settings, storage_replication_tasks, storage_cleanup_jobs, content_asset_refs, content_blobs, content_assets, content_migrations, storage_backends, api_audit_entries, api_keys, page_revisions, pages, sessions, users, spaces RESTART IDENTITY CASCADE`);
  await ensureDefaultSpace();
  await seedDefaultStorageBackend();
}

export async function createAdminUser(options: {
  email?: string;
  password?: string;
} = {}): Promise<{ userId: string; email: string }> {
  const email = options.email ?? SETUP_ADMIN_EMAIL;
  const passwordHash = await bcrypt.hash(options.password ?? SETUP_ADMIN_PASSWORD, 10);
  const [user] = await db
    .insert(schema.users)
    .values({ email, passwordHash, role: 'admin', status: 'active' })
    .returning();
  if (!user) throw new Error('Failed to create admin fixture');
  return { userId: user.id, email };
}

export async function readSetupProgress() {
  return db.query.setupProgress.findFirst({
    where: eq(schema.setupProgress.id, 'default'),
  });
}

export async function ensureDefaultSpace(): Promise<{ spaceId: string }> {
  const existing = await db.query.spaces.findFirst({
    where: eq(schema.spaces.slug, 'default'),
  });
  if (existing) return { spaceId: existing.id };
  const [space] = await db
    .insert(schema.spaces)
    .values({ slug: 'default', name: 'Default', defaultLocale: 'en', anonymousRead: true })
    .returning();
  if (!space) throw new Error('Failed to create default space fixture');
  return { spaceId: space.id };
}

export async function findPageByPath(path: string) {
  return db.query.pages.findFirst({ where: eq(schema.pages.path, path) });
}

/**
 * Minimal OpenRouter HTTP fixture: validates the bearer key and serves the
 * model catalog endpoints the detector and provider adapters call.
 */
export async function startOpenRouterFixture(options: {
  rateLimited?: boolean;
  delayMs?: number;
} = {}) {
  const requests: Array<{ path: string; authorization: string | null }> = [];
  const server = createServer(async (request, response) => {
    requests.push({ path: request.url ?? '/', authorization: request.headers.authorization ?? null });
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    if (options.rateLimited) {
      response.writeHead(429, { 'content-type': 'application/json', 'retry-after': '1' });
      response.end(JSON.stringify({ error: { message: 'rate limited' } }));
      return;
    }
    if (request.headers.authorization !== `Bearer ${OPENROUTER_FIXTURE_KEY}`) {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'invalid key' } }));
      return;
    }
    if (request.url?.startsWith('/embeddings/models')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [
        {
          id: 'fixture/embed',
          name: 'Fixture Embedding',
          embedding_dimensions: 3,
          architecture: { input_modalities: ['text'], output_modalities: ['embeddings'] },
        },
      ] }));
      return;
    }
    if (request.url?.startsWith('/models')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [
        {
          id: 'fixture/text',
          name: 'Fixture Text',
          context_length: 32_000,
          architecture: { input_modalities: ['text'], output_modalities: ['text'] },
        },
        {
          id: 'fixture/image',
          name: 'Fixture Image',
          architecture: { input_modalities: ['text'], output_modalities: ['image'] },
        },
      ] }));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'not found' } }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture failed to listen');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      server.close();
      server.closeAllConnections();
      await once(server, 'close');
    },
  };
}
