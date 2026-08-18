import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { setModeInternal } from '@/server/services/writing-mode';
import { seedWritingModeSpaces } from '@/server/seed';
import { captureConversation } from '@/server/services/raw-conversations';
import { createSearchFixtureCorpus, CHINESE_NEAR_MATCH, ENGLISH_TERM, HIDDEN_TOKEN } from '@/server/services/search/test-support';
import { clearAiData, createAiTestUser, createWikiQuestionAction, removeAiTestUser, seedCompletedConversationEvents } from '../../../../test/ai-fixtures';
import { ensurePublicApiDefaultSpace } from '../../../../test/public-wiki-api-fixtures';
import { loadWikiQuestionSources, SEMANTIC_NOISE_FLOOR } from './wiki-question-sources';

/**
 * Wiki AI's citation retrieval now shares the same full_text + fuzzy + semantic
 * hybrid, the same RRF fusion, and the same permission projection as site
 * Search (`apps/web/src/server/services/search/coordinator.ts`) instead of a
 * separate vector-only pipeline. `semanticSearchEnabled: false` is used
 * throughout so these tests exercise the shared lexical engines against the
 * real database without needing a live/fake embedding provider — that is
 * also exactly the "not yet embedded" scenario that caused the reported bug
 * (a page findable by keyword but absent from Wiki AI's citations).
 */

async function readyGeneration(userId: string) {
  const [provider] = await db.insert(schema.aiProviders).values({
    name: `Wiki question fixture ${randomUUID()}`,
    kind: 'openai_compatible',
    baseUrl: 'https://example.com',
    credentialsEncrypted: 'encrypted',
    createdBy: userId,
    updatedBy: userId,
  }).returning();
  const [model] = await db.insert(schema.aiModels).values({
    providerId: provider!.id,
    externalId: 'embed',
    displayName: 'Embed',
    availability: 'available',
    embeddingDimensions: 3,
  }).returning();
  const [generation] = await db.insert(schema.aiIndexGenerations).values({
    modelId: model!.id,
    embeddingDimensions: 3,
    chunkerVersion: 'test',
    status: 'ready',
    isActive: true,
  }).returning();
  return generation!;
}

async function setSearchSettings(overrides: Partial<typeof schema.searchSettings.$inferInsert> = {}) {
  await db.delete(schema.searchSettings);
  await db.insert(schema.searchSettings).values({
    id: 'default',
    fullTextSearchEnabled: true,
    fuzzySearchEnabled: true,
    // Off by default in these tests: exercises the shared lexical engines
    // deterministically without a live/fake embedding provider.
    semanticSearchEnabled: false,
    immediateSearchTimeoutMs: 2000,
    minRelevanceScore: 0,
    showExcerpts: true,
    excerptLength: 120,
    ...overrides,
  });
}

describe('SEMANTIC_NOISE_FLOOR', () => {
  it('stays the noise floor previously enforced on raw vector matches, scoped only to the semantic leg', () => {
    expect(SEMANTIC_NOISE_FLOOR).toBe(0.2);
  });
});

describe('loadWikiQuestionSources', () => {
  beforeEach(async () => {
    await clearAiData();
    await setSearchSettings();
    await ensurePublicApiDefaultSpace();
  });

  afterAll(async () => {
    await closeDb();
  });

  it('cites a page found only by keyword match — regression for the reported miss where Search found a page Wiki AI did not', async () => {
    const corpus = await createSearchFixtureCorpus(`wq-lexonly-${randomUUID().slice(0, 8)}`);
    const admin = await createAiTestUser('admin');
    try {
      await readyGeneration(admin);
      const result = await loadWikiQuestionSources({
        ctx: corpus.editorCtx,
        actionId: randomUUID(),
        question: ENGLISH_TERM,
        mode: 'retrieval',
        textContextWindow: null,
      });
      expect(result.results.map((r) => r.pageId)).toContain(corpus.pages.english.pageId);
      expect(result.sources.some((s) => s.pageId === corpus.pages.english.pageId)).toBe(true);
    } finally {
      await removeAiTestUser(admin);
    }
  });

  it('never lets a page a reader cannot see become a citation, even when it matches lexically', async () => {
    const corpus = await createSearchFixtureCorpus(`wq-perm-${randomUUID().slice(0, 8)}`);
    const admin = await createAiTestUser('admin');
    try {
      await readyGeneration(admin);
      const result = await loadWikiQuestionSources({
        ctx: corpus.readerCtx,
        actionId: randomUUID(),
        question: HIDDEN_TOKEN,
        mode: 'retrieval',
        textContextWindow: null,
      });
      expect(result.results).toHaveLength(0);
      expect(JSON.stringify(result)).not.toContain(HIDDEN_TOKEN);
    } finally {
      await removeAiTestUser(admin);
    }
  });

  it('honors the admin minRelevanceScore floor shared with Search', async () => {
    const corpus = await createSearchFixtureCorpus(`wq-minrel-${randomUUID().slice(0, 8)}`);
    const admin = await createAiTestUser('admin');
    try {
      await readyGeneration(admin);
      // The question is an exact, verbatim match of the page's title, so
      // `toLexicalCandidate` scores it 0.9 (exact.title, short of the 1.0
      // reserved for an exact *path* match) — 0.95 must exclude it, and
      // anything below 0.9 must not.
      await setSearchSettings({ minRelevanceScore: 95 });
      const result = await loadWikiQuestionSources({
        ctx: corpus.editorCtx,
        actionId: randomUUID(),
        question: ENGLISH_TERM,
        mode: 'retrieval',
        textContextWindow: null,
      });
      expect(result.results.some((r) => r.pageId === corpus.pages.english.pageId)).toBe(false);
    } finally {
      await removeAiTestUser(admin);
    }
  });

  it('stops contributing a lexical engine an administrator has disabled', async () => {
    const corpus = await createSearchFixtureCorpus(`wq-disabled-${randomUUID().slice(0, 8)}`);
    const admin = await createAiTestUser('admin');
    try {
      await readyGeneration(admin);
      // CHINESE_NEAR_MATCH is a one-character variant of the fixture's exact
      // phrase — findable only through fuzzy's word-similarity operator, not
      // full_text's exact-lexeme tsvector match, so disabling fuzzy alone
      // must remove it. (full_text stays on: the DB forbids disabling both.)
      await setSearchSettings({ fuzzySearchEnabled: false });
      const result = await loadWikiQuestionSources({
        ctx: corpus.editorCtx,
        actionId: randomUUID(),
        question: CHINESE_NEAR_MATCH,
        mode: 'retrieval',
        textContextWindow: null,
      });
      expect(result.results.some((r) => r.pageId === corpus.pages.chinese.pageId)).toBe(false);
    } finally {
      await removeAiTestUser(admin);
    }
  });

  it('excludes a captured conversation page from citations even when it matches lexically', async () => {
    const admin = await createAiTestUser('admin');
    const adminCtx = buildUserCtx(admin, 'admin');
    try {
      await readyGeneration(admin);
      await seedWritingModeSpaces();
      await setModeInternal('llm-wiki', admin);
      const uniquePhrase = `wq-conv-marker-${randomUUID().slice(0, 8)}`;
      const actionId = await createWikiQuestionAction(admin, {
        rawConversationCaptureStatus: 'pending',
        requestMetadata: { origin: 'web' },
      });
      await seedCompletedConversationEvents(actionId, { question: `What is ${uniquePhrase}?` });
      const outcome = await captureConversation(actionId);
      if (outcome.status !== 'captured') throw new Error(`expected captured, got ${outcome.status}`);

      const result = await loadWikiQuestionSources({
        ctx: adminCtx,
        actionId: randomUUID(),
        question: uniquePhrase,
        mode: 'retrieval',
        textContextWindow: null,
      });
      expect(result.results.some((r) => r.pageId === outcome.pageId)).toBe(false);
    } finally {
      // Not removeAiTestUser(admin): the captured page's revision still
      // references this user as author (matches how createSearchFixtureCorpus
      // fixtures elsewhere in this suite are left in place, not torn down).
      await setModeInternal('copilot', admin);
    }
  });
});
