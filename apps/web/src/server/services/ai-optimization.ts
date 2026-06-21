import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { assertAiFeature } from './ai-entitlements';
import { createAction } from './ai-actions';
import { getAssignedModel } from './ai-question';

export function selectionHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function assertEditableRevision(ctx: PermCtx, pageId: string, revisionId: string) {
  const row = await db
    .select({ page: schema.pages, revision: schema.pageRevisions })
    .from(schema.pages)
    .innerJoin(schema.pageRevisions, eq(schema.pageRevisions.id, revisionId))
    .where(
      and(
        eq(schema.pages.id, pageId),
        eq(schema.pageRevisions.pageId, pageId),
        eq(schema.pages.latestVersionId, revisionId),
        isNull(schema.pages.deletedAt),
      ),
    )
    .limit(1);
  const current = row[0];
  const actorId = getActorUserId(ctx);
  if (
    !current ||
    !can(ctx, 'edit', { kind: 'page', pageId }, { isAuthor: current.page.authorId === actorId })
  ) {
    throw new DomainError('FORBIDDEN', 'You cannot edit this page');
  }
  return current;
}

export async function createTextOptimization(
  ctx: PermCtx,
  input: {
    pageId: string;
    revisionId: string;
    selection: { text: string; hash: string; from: number; to: number };
    instruction: 'improve_clarity' | 'fix_grammar' | 'shorten' | 'expand';
  },
) {
  await assertAiFeature(ctx, 'text');
  await assertEditableRevision(ctx, input.pageId, input.revisionId);
  if (selectionHash(input.selection.text) !== input.selection.hash) {
    throw new DomainError('BAD_REQUEST', 'Selection hash is invalid');
  }
  if (Buffer.byteLength(input.selection.text) > 100_000) {
    throw new DomainError('INPUT_TOO_LARGE', 'Selected text is too large');
  }
  const { model, provider } = await getAssignedModel('wiki_text');
  return createAction(ctx, {
    feature: 'text_optimization',
    input,
    providerId: provider.id,
    modelId: model.id,
    pageId: input.pageId,
    requestMetadata: {
      selectionBytes: Buffer.byteLength(input.selection.text),
      instruction: input.instruction,
      selectionHash: input.selection.hash,
      from: input.selection.from,
      to: input.selection.to,
      providerName: provider.name,
    },
  });
}

export { assertEditableRevision };
