import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
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
