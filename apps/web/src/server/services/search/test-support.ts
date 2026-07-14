import { like, or } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildApiKeyCtx, buildUserCtx, type PermCtx } from '@/server/permissions';
import * as pageService from '@/server/services/pages';
import * as revisionService from '@/server/services/revisions';
import { createPublicApiUser } from '../../../../test/public-wiki-api-fixtures';

/**
 * Deterministic search fixtures shared by the capability, projection, and
 * ranking suites. Each corpus is namespaced by `prefix` so parallel test
 * files never collide on paths or user emails.
 */
export type SearchFixtureCorpus = {
  editorCtx: PermCtx;
  readerCtx: PermCtx;
  editorId: string;
  readerId: string;
  pages: {
    /** Readable published English page matching the exact term corpus. */
    english: { pageId: string; path: string; title: string };
    /** Readable published Chinese page for fragment / near-match coverage. */
    chinese: { pageId: string; path: string; title: string };
    /** Readable published page describing the concept without the literal terms. */
    semantic: { pageId: string; path: string; title: string };
    /** Draft-only page a reader must never see through any capability. */
    hiddenDraft: { pageId: string; path: string; title: string };
  };
};

export const ENGLISH_TERM = 'search architecture';
export const CHINESE_PHRASE = '跨境支付对账流程';
export const CHINESE_FRAGMENT = '支付对账';
/** One-character imperfect variation of {@link CHINESE_FRAGMENT}. */
export const CHINESE_NEAR_MATCH = '支付对帐';
export const HIDDEN_TOKEN = 'CONFIDENTIALSEARCHTOKEN';

/**
 * Soft-deletes corpora left behind by earlier tests and runs. The test
 * database persists between invocations, and identical fixture content from
 * a previous corpus would otherwise tie with (and outrank, by path order)
 * the current corpus in similarity-ordered assertions.
 */
async function retireEarlierCorpora(): Promise<void> {
  await db.update(schema.pages)
    .set({ deletedAt: new Date() })
    .where(or(
      like(schema.pages.path, '%/search-architecture'),
      like(schema.pages.path, '%/cross-border-reconciliation'),
      like(schema.pages.path, '%/sign-in-protection'),
      like(schema.pages.path, '%/secret-plan'),
    ));
}

export async function createSearchFixtureCorpus(prefix: string): Promise<SearchFixtureCorpus> {
  await retireEarlierCorpora();
  const editor = await createPublicApiUser(`${prefix}-editor@example.com`, 'editor');
  const reader = await createPublicApiUser(`${prefix}-reader@example.com`, 'reader');
  const editorCtx = buildUserCtx(editor.id, 'editor');
  const readerCtx = buildApiKeyCtx(reader.id, 'reader', ['view'], `${prefix}-reader-key`);

  async function publishPage(path: string, title: string, contentSource: string) {
    const created = await pageService.create(editorCtx, { path, title, contentSource });
    await revisionService.publish(editorCtx, { path, version: 1 });
    return { pageId: created.pageId, path, title };
  }

  const english = await publishPage(
    `${prefix}/search-architecture`,
    'Search Architecture',
    '# Search Architecture\n\nThis page explains the search architecture, ranking, and retrieval design.',
  );
  const chinese = await publishPage(
    `${prefix}/cross-border-reconciliation`,
    '跨境支付对账',
    `# 跨境支付对账\n\n本页描述${CHINESE_PHRASE}，包括对账单核对与差异处理。`,
  );
  const semantic = await publishPage(
    `${prefix}/sign-in-protection`,
    'Sign-in Protection',
    '# Sign-in Protection\n\nHow accounts verify identity before granting access to protected resources.',
  );

  const hiddenCreated = await pageService.create(editorCtx, {
    path: `${prefix}/secret-plan`,
    title: 'Secret Plan',
    contentSource: `# Secret Plan\n\n${HIDDEN_TOKEN} 跨境支付对账 search architecture details.`,
  });
  const hiddenDraft = { pageId: hiddenCreated.pageId, path: `${prefix}/secret-plan`, title: 'Secret Plan' };

  return {
    editorCtx,
    readerCtx,
    editorId: editor.id,
    readerId: reader.id,
    pages: { english, chinese, semantic, hiddenDraft },
  };
}
