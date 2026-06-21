import { asc, eq, isNull } from 'drizzle-orm';
import type { PermCtx } from '@/server/permissions';
import { can } from '@/server/permissions';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import type { QuestionSource } from '@/server/ai/prompts/wiki-question';

export function estimateFullContextTokens(question: string, sources: QuestionSource[]): number {
  const inputBytes =
    Buffer.byteLength(question) +
    sources.reduce((total, source) => total + Buffer.byteLength(source.content) + 256, 0) +
    2_000;
  return Math.ceil(inputBytes / 3);
}

export function assertFullContextCapacity(
  contextWindow: number | null,
  question: string,
  sources: QuestionSource[],
): void {
  if (!contextWindow) throw new DomainError('FULL_CONTEXT_TOO_LARGE', 'The selected model has no known context capacity');
  if (estimateFullContextTokens(question, sources) > Math.floor(contextWindow * 0.8)) {
    throw new DomainError('FULL_CONTEXT_TOO_LARGE', 'The complete readable Wiki does not fit the selected model context');
  }
}

export async function loadReadableFullContext(
  ctx: PermCtx,
  contextWindow: number | null,
  question: string,
): Promise<QuestionSource[]> {
  const rows = await db
    .select({
      pageId: schema.pages.id,
      title: schema.pages.title,
      path: schema.pages.path,
      locale: schema.pages.locale,
      revisionId: schema.pageRevisions.id,
      revisionHash: schema.pageRevisions.contentHash,
      content: schema.pageRevisions.contentSource,
      anonymousRead: schema.spaces.anonymousRead,
    })
    .from(schema.pages)
    .innerJoin(schema.spaces, eq(schema.pages.spaceId, schema.spaces.id))
    .innerJoin(schema.pageRevisions, eq(schema.pages.currentPublishedVersionId, schema.pageRevisions.id))
    .where(isNull(schema.pages.deletedAt))
    .orderBy(asc(schema.pages.path), asc(schema.pages.locale));

  const readable = rows.filter((row) =>
    can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: row.anonymousRead }),
  );
  const sources = readable.map((row, index) => ({
    id: `S${index + 1}`,
    pageId: row.pageId,
    title: row.title,
    path: row.path,
    locale: row.locale,
    revisionId: row.revisionId,
    revisionHash: row.revisionHash,
    content: row.content ?? '',
  }));
  assertFullContextCapacity(contextWindow, question, sources);
  return sources;
}
