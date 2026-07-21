import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { AiEventType } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';

export async function clearAiData(): Promise<void> {
  await db.execute(sql.raw(`
    truncate table
      ai_generated_artifacts, ai_action_events, ai_action_inputs, ai_actions,
      ai_knowledge_chunks, ai_page_index_states, ai_index_generations,
      user_ai_entitlements, ai_purpose_assignments, ai_model_capabilities,
      ai_models, ai_providers, ai_settings
    restart identity cascade
  `));
}

export async function createAiTestUser(role: 'admin' | 'editor' | 'reader' = 'admin') {
  const id = randomUUID();
  await db.insert(schema.users).values({
    id,
    email: `ai-${role}-${id}@example.com`,
    passwordHash: 'test',
    role,
  });
  return id;
}

export async function removeAiTestUser(id: string): Promise<void> {
  await db.delete(schema.users).where(eq(schema.users.id, id));
}

export const fixtureCredential = { apiKey: 'test-key' };

// ---- 023: Raw Conversation capture fixtures --------------------------------

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Inserts a bare `wiki_question` ai_actions row for capture/raw-conversation
 * tests, bypassing the create-action service so tests can set pointer/status
 * fields directly without a live provider/model. */
export async function createWikiQuestionAction(
  actorUserId: string,
  overrides: Partial<typeof schema.aiActions.$inferInsert> = {},
): Promise<string> {
  const [row] = await db
    .insert(schema.aiActions)
    .values({
      feature: 'wiki_question',
      status: 'queued',
      actorUserId,
      questionMode: 'full',
      expiresAt: new Date(Date.now() + ONE_HOUR_MS),
      ...overrides,
    })
    .returning({ id: schema.aiActions.id });
  return row!.id;
}

export async function appendConversationEvent(
  actionId: string,
  type: AiEventType,
  payload: Record<string, unknown>,
): Promise<number> {
  const [row] = await db
    .insert(schema.aiActionEvents)
    .values({ actionId, type, payload, expiresAt: new Date(Date.now() + ONE_HOUR_MS) })
    .returning({ id: schema.aiActionEvents.id });
  return row!.id;
}

/** Standard question -> answer -> citations -> completed event sequence used
 * across capture/transcript-projection tests. */
export async function seedCompletedConversationEvents(
  actionId: string,
  overrides: { question?: string; answer?: string; thinking?: string } = {},
): Promise<void> {
  const question = overrides.question ?? 'What is the deployment topology?';
  const answer = overrides.answer ?? 'The wiki runs as a single Docker Compose stack.';
  await appendConversationEvent(actionId, 'question', { text: question });
  await appendConversationEvent(actionId, 'status', { status: 'running' });
  if (overrides.thinking) {
    await appendConversationEvent(actionId, 'reasoning_delta', { text: overrides.thinking });
  }
  await appendConversationEvent(actionId, 'text_delta', { text: answer });
  await appendConversationEvent(actionId, 'citations', { citations: [] });
  await appendConversationEvent(actionId, 'completed', { status: 'completed' });
}

async function ensureSpaceByKind(slug: string, kind: 'raw') {
  const [space] = await db
    .insert(schema.spaces)
    .values({ slug, name: slug, kind, anonymousRead: false })
    .onConflictDoNothing()
    .returning();
  return space ?? (await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, slug) }))!;
}

export async function ensureRawSpaceForConversations() {
  return ensureSpaceByKind('raw', 'raw');
}

/** Ensures the built-in Conversation raw category exists for tests, using the
 * same idempotent path the real seed/capture code uses. */
export async function ensureConversationCategoryFixture() {
  const { ensureSystemCategory } = await import('@/server/services/raw-categories');
  return ensureSystemCategory('conversation', {
    name: 'Conversation',
    slug: 'conversation',
    description: 'Captured Wiki AI conversations.',
  });
}
