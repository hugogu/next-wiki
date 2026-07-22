import { and, eq, isNull } from 'drizzle-orm';
import {
  AI_CONVERSATIONS_SOURCE_KEY,
  type AiActionAccepted,
  type AiQuestionMode,
  type AiToolReviewDecision,
} from '@next-wiki/shared';
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

/** Whether a model has the discovered/overridden `tool_calling` capability.
 * The current provider-agnostic tool loop uses a textual fenced JSON protocol,
 * so missing capability metadata is treated as usable; explicit negative
 * detector/manual rows still disable tool chat and trigger fallback. */
export async function modelSupportsToolCalling(modelId: string): Promise<boolean> {
  const rows = await db
    .select({ supported: schema.aiModelCapabilities.supported })
    .from(schema.aiModelCapabilities)
    .where(
      and(
        eq(schema.aiModelCapabilities.modelId, modelId),
        eq(schema.aiModelCapabilities.capability, 'tool_calling'),
      ),
    );
  return rows.length === 0 || rows.some((row) => row.supported);
}

/**
 * Create a tool-enabled chat turn (026, US2). Returns a recoverable fallback
 * marker when the assigned model cannot call tools, so the route degrades to an
 * ordinary Q&A action rather than performing hidden out-of-band tool use.
 */
export async function createWikiToolChat(
  ctx: PermCtx,
  input: {
    question: string;
    requestedReview: AiToolReviewDecision;
    currentPage?: { pageId: string; revisionId: string };
    conversation?: { question: string; answer: string }[];
    requestMetadata?: Record<string, unknown>;
  },
): Promise<{ fallback: true } | { fallback: false; action: AiActionAccepted }> {
  await assertAiFeature(ctx, 'question');
  await validateCurrentPage(ctx, input.currentPage);
  const { model, provider } = await getAssignedModel('wiki_text');
  if (!(await modelSupportsToolCalling(model.id))) {
    return { fallback: true };
  }
  const captureEnabled = await isDataSourceEnabled(AI_CONVERSATIONS_SOURCE_KEY);
  const action = await createAction(ctx, {
    feature: 'wiki_tool_chat',
    input: {
      question: input.question,
      requestedReview: input.requestedReview,
      currentPage: input.currentPage,
      conversation: input.conversation,
    },
    providerId: provider.id,
    modelId: model.id,
    pageId: input.currentPage?.pageId ?? null,
    requestMetadata: {
      ...input.requestMetadata,
      questionBytes: Buffer.byteLength(input.question),
      hasCurrentPage: Boolean(input.currentPage),
      providerName: provider.name,
      requestedReview: input.requestedReview,
    },
    rawConversationCaptureStatus: captureEnabled ? 'pending' : 'disabled',
  });
  return { fallback: false, action };
}
