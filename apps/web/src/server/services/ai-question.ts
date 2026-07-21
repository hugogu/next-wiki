import { and, eq, isNull } from 'drizzle-orm';
import { AI_CONVERSATIONS_SOURCE_KEY, type AiQuestionMode } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { assertAiFeature } from './ai-entitlements';
import { createAction } from './ai-actions';
import { isDataSourceEnabled } from './content-data-sources';

export async function getAssignedModel(purpose: 'wiki_text' | 'wiki_embedding' | 'wiki_image') {
  const rows = await db
    .select({ model: schema.aiModels, provider: schema.aiProviders })
    .from(schema.aiPurposeAssignments)
    .innerJoin(schema.aiModels, eq(schema.aiPurposeAssignments.modelId, schema.aiModels.id))
    .innerJoin(schema.aiProviders, eq(schema.aiModels.providerId, schema.aiProviders.id))
    .where(eq(schema.aiPurposeAssignments.purpose, purpose))
    .limit(1);
  const assigned = rows[0];
  if (!assigned) throw new DomainError('AI_NOT_CONFIGURED', `No model is assigned for ${purpose}`);
  if (!assigned.provider.enabled)
    throw new DomainError('PROVIDER_DISABLED', 'The assigned AI provider is disabled');
  if (assigned.model.availability !== 'available')
    throw new DomainError('MODEL_UNAVAILABLE', 'The assigned AI model is unavailable');
  return assigned;
}

async function validateCurrentPage(
  ctx: PermCtx,
  currentPage?: { pageId: string; revisionId: string },
): Promise<void> {
  if (!currentPage) return;
  const rows = await db
    .select({ anonymousRead: schema.spaces.anonymousRead })
    .from(schema.pages)
    .innerJoin(schema.spaces, eq(schema.pages.spaceId, schema.spaces.id))
    .innerJoin(schema.pageRevisions, eq(schema.pageRevisions.pageId, schema.pages.id))
    .where(
      and(
        eq(schema.pages.id, currentPage.pageId),
        eq(schema.pageRevisions.id, currentPage.revisionId),
        isNull(schema.pages.deletedAt),
      ),
    )
    .limit(1);
  if (
    !rows[0] ||
    !can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: rows[0].anonymousRead })
  ) {
    throw new DomainError('NOT_FOUND', 'Current page not found');
  }
}

export async function createWikiQuestion(
  ctx: PermCtx,
  input: {
    question: string;
    mode: AiQuestionMode;
    currentPage?: { pageId: string; revisionId: string };
    conversation?: { question: string; answer: string }[];
    /** Internal channel metadata; never contains the raw question or credentials. */
    requestMetadata?: Record<string, unknown>;
  },
) {
  await assertAiFeature(ctx, 'question');
  await validateCurrentPage(ctx, input.currentPage);
  const { model, provider } = await getAssignedModel('wiki_text');
  // 023/025: capture eligibility is decided once, at create time, from the
  // AI Conversations data-source setting — later toggles only affect
  // conversations created after the change (see content-data-sources.ts).
  const captureEnabled = await isDataSourceEnabled(AI_CONVERSATIONS_SOURCE_KEY);
  return createAction(ctx, {
    feature: 'wiki_question',
    input,
    providerId: provider.id,
    modelId: model.id,
    pageId: input.currentPage?.pageId ?? null,
    questionMode: input.mode,
    requestMetadata: {
      ...input.requestMetadata,
      questionBytes: Buffer.byteLength(input.question),
      hasCurrentPage: Boolean(input.currentPage),
      providerName: provider.name,
    },
    rawConversationCaptureStatus: captureEnabled ? 'pending' : 'disabled',
  });
}
