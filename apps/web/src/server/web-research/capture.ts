import { and, eq } from 'drizzle-orm';
import type { PermCtx } from '@/server/permissions';
import { getActorUserId } from '@/server/permissions';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { recordTerminalAction, requireActionAccess } from '@/server/services/ai-actions';
import { ensureToolEvidenceCategory } from '@/server/services/ai-tool-evidence';
import { createEntry } from '@/server/services/raw-entries';
import { readOpenedWebSource } from './sources';

function rawTitle(value: string): string {
  return `Web evidence: ${value.replace(/[\r\n]+/g, ' ').trim().slice(0, 170) || 'Untitled source'}`;
}

export async function captureWebSource(ctx: PermCtx, input: { actionId: string; sourceId: string }) {
  if (ctx.actor.kind !== 'user') throw new DomainError('UNAUTHORIZED', 'Sign in to preserve web evidence');
  const action = await requireActionAccess(ctx, input.actionId);
  if (action.feature !== 'wiki_question' && action.feature !== 'wiki_tool_chat') {
    throw new DomainError('NOT_FOUND', 'Web evidence is only available for Wiki AI answers');
  }
  const { source, content } = await readOpenedWebSource(input.actionId, input.sourceId);
  const category = await ensureToolEvidenceCategory();
  const retrievedAt = source.retrievedAt.toISOString();
  const contentHash = source.contentHash ?? '';
  const evidence = [
    `# ${source.title}`,
    '',
    `Source: ${source.canonicalUrl}`,
    `Retrieved: ${retrievedAt}`,
    `Provider: ${source.provider}`,
    contentHash ? `Content hash: ${contentHash}` : '',
    '',
    '---',
    '',
    content,
  ].filter(Boolean).join('\n');
  const created = await createEntry(ctx, {
    path: `web-evidence/${source.id}`,
    title: rawTitle(source.title),
    inputKind: 'external-fetch',
    source: {
      channel: 'web-research',
      url: source.canonicalUrl,
      sourceId: source.id,
      title: source.title.slice(0, 500),
      provider: source.provider,
      contentHash: contentHash || undefined,
      retrievedAt,
      occurredAt: retrievedAt,
    },
    content: evidence,
    categoryId: category.id,
  });
  await db.transaction(async (tx) => {
    await tx.update(schema.aiWebSources).set({
      status: 'captured',
      capturedRawPageId: created.pageId,
      capturedRawRevisionId: created.versionId,
      capturedAt: new Date(),
      capturedBy: getActorUserId(ctx),
      updatedAt: new Date(),
    }).where(and(eq(schema.aiWebSources.id, source.id), eq(schema.aiWebSources.aiActionId, input.actionId)));
    await tx.insert(schema.aiWebResearchAttempts).values({
      aiActionId: input.actionId,
      actorUserId: getActorUserId(ctx),
      provider: source.provider,
      kind: 'capture',
      outcome: 'succeeded',
      policyDisposition: 'user_preserved',
    });
  });
  await recordTerminalAction(ctx, {
    feature: 'web_evidence_capture',
    status: 'completed',
    requestMetadata: { sourceId: source.id, provider: source.provider },
    resultMetadata: { rawPageId: created.pageId, rawRevisionId: created.versionId },
  });
  return { ...created, rawPath: `web-evidence/${source.id}` };
}
