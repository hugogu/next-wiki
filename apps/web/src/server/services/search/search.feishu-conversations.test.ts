import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_IMMEDIATE_SEARCH_TIMEOUT_MS, type SearchCapabilityId } from '@next-wiki/shared';
import { closeDb, db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { setModeInternal } from '@/server/services/writing-mode';
import { getSpaceBySlug } from '@/server/services/spaces';
import { seedWritingModeSpaces } from '@/server/seed';
import { captureConversation } from '@/server/services/raw-conversations';
import { createPublicApiUser } from '../../../../test/public-wiki-api-fixtures';
import { createWikiQuestionAction, seedCompletedConversationEvents } from '../../../../test/ai-fixtures';
import { runCoordinatedSearch, type CoordinatedSearchInput } from './coordinator';
import { createSearchEngineRegistry } from './registry';
import type { SearchCandidate, SearchEngine, SearchEngineOutcome, SearchEngineQuery } from './types';

/**
 * 025 (US4): a Feishu-captured turn must be discoverable through the exact
 * same Raw search path as a web-captured turn — no Feishu-specific branch in
 * the coordinator or the permission projection (plan.md D6). This mirrors
 * `coordinator.test.ts`'s "permission projection" test but drives it with a
 * real captured Feishu Raw Conversation page instead of a synthetic
 * candidate, and asserts the `conversationChannel` marker survives the
 * fused, permission-projected result.
 */
function fakeEngine(
  capability: SearchCapabilityId,
  behavior: (query: SearchEngineQuery) => Promise<SearchEngineOutcome> | SearchEngineOutcome,
): SearchEngine {
  return { capability, async run(_ctx, query) { return behavior(query); } };
}

function readyWith(candidates: SearchCandidate[]): SearchEngineOutcome {
  return { state: 'ready', candidates };
}

async function baseInput(q: string, spaceId: string): Promise<CoordinatedSearchInput> {
  return {
    q,
    limit: 20,
    snapshot: { full_text: true, fuzzy: false, semantic: false },
    excerpt: { windowSize: 120, show: true },
    minRelevanceScore: 0,
    immediateSearchTimeoutMs: DEFAULT_IMMEDIATE_SEARCH_TIMEOUT_MS,
    spaceIds: [spaceId],
    spaceSlugs: ['raw'],
  };
}

describe('search — Feishu-captured conversations (025, US4)', () => {
  afterAll(async () => {
    await closeDb();
  });

  it('a keyword-search hit on a captured Feishu turn survives fusion and permission projection with its channel marker; an unpermitted reader gets zero', async () => {
    await seedWritingModeSpaces();
    const admin = await createPublicApiUser(`search-feishu-admin-${randomUUID()}@example.com`, 'admin');
    const adminCtx = buildUserCtx(admin.id, 'admin');
    const reader = await createPublicApiUser(`search-feishu-reader-${randomUUID()}@example.com`, 'reader');
    const readerCtx = buildUserCtx(reader.id, 'reader');

    await setModeInternal('llm-wiki', admin.id);
    try {
      const raw = await getSpaceBySlug('raw');
      expect(raw).not.toBeNull();
      await db.insert(schema.rawCategories).values({ name: 'General', slug: 'general', isDefault: true }).onConflictDoNothing();

      const uniquePhrase = `feishu-search-marker-${randomUUID().slice(0, 8)}`;
      const actionId = await createWikiQuestionAction(admin.id, {
        rawConversationCaptureStatus: 'pending',
        requestMetadata: { origin: 'feishu' },
      });
      await seedCompletedConversationEvents(actionId, { question: `What is ${uniquePhrase}?` });
      const outcome = await captureConversation(actionId);
      if (outcome.status !== 'captured') throw new Error('expected captured');
      expect(outcome.channel).toBe('feishu');

      const registry = createSearchEngineRegistry([
        fakeEngine('full_text', () => readyWith([{ pageId: outcome.pageId, rank: 0, exact: { term: true }, compatRelevance: 1 }])),
      ]);

      // Admin (Raw-permitted) sees the captured page with the channel marker.
      const adminSnapshot = await runCoordinatedSearch(adminCtx, await baseInput(uniquePhrase, raw!.id), registry);
      expect(adminSnapshot.items).toHaveLength(1);
      expect(adminSnapshot.items[0]!.page.id).toBe(outcome.pageId);
      expect(adminSnapshot.items[0]!.page.conversationChannel).toBe('feishu');

      // A reader without Raw read permission gets zero results, zero
      // excerpts, zero counts — no existence signal leaks through.
      const readerSnapshot = await runCoordinatedSearch(readerCtx, await baseInput(uniquePhrase, raw!.id), registry);
      expect(readerSnapshot.items).toHaveLength(0);
      expect(readerSnapshot.keywordReadableCount).toBe(0);
      expect(JSON.stringify(readerSnapshot)).not.toContain(uniquePhrase);
    } finally {
      await setModeInternal('copilot', admin.id);
    }
  });
});
