import { eq } from 'drizzle-orm';
import type { AiQuestionMode } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { createAiProviderAdapter } from '@/server/ai/registry';
import {
  buildWikiQuestionPrompt,
  isInsufficientAnswer,
  normalizeQuestionCitations,
  searchResultsToSources,
  type QuestionSource,
} from '@/server/ai/prompts/wiki-question';
import { loadReadableFullContext } from '@/server/ai/retrieval/full-context';
import { providerRuntime } from '@/server/services/ai-admin';
import { assertAiFeature } from '@/server/services/ai-entitlements';
import {
  appendActionEvent,
  finishAction,
  isCancellationRequested,
  readActionInput,
} from '@/server/services/ai-actions';
import { retrieve } from '@/server/services/ai-retrieval';
import {
  nudgeAnswerDelivery,
  toFeishuCitations,
} from '@/server/services/feishu-notifications';
import {
  completeFeishuAnswerStream,
  failFeishuAnswerStream,
  startFeishuAnswerStream,
} from '@/server/services/feishu-answer-streams';

type QuestionInput = {
  question: string;
  mode: AiQuestionMode;
  currentPage?: { pageId: string; revisionId: string };
  conversation?: { question: string; answer: string }[];
};

export async function runWikiQuestionAction(actionId: string): Promise<void> {
  const input = await readActionInput<QuestionInput>(actionId);
  const action = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
  if (!input || !action?.actorUserId || !action.modelId || !action.providerId) {
    throw new DomainError('CANCELLED', 'Question input expired');
  }
  const [user, textModel] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, action.actorUserId) }),
    db.query.aiModels.findFirst({ where: eq(schema.aiModels.id, action.modelId) }),
  ]);
  if (!user || user.status !== 'active' || !textModel)
    throw new DomainError('CANCELLED', 'Question action is no longer authorized');
  const ctx = buildUserCtx(user.id, user.role);
  await assertAiFeature(ctx, 'question');

  // Recorded once, up front, so the session history panel can show what was
  // asked even though the encrypted raw input is purged as soon as the action
  // finishes — this copy is bounded by the same event retention window as the
  // rest of the conversation, not kept indefinitely.
  await appendActionEvent(actionId, 'question', { text: input.question });

  let sources: QuestionSource[];
  let retrievalUsage: Record<string, unknown> = {};
  if (input.mode === 'full') {
    sources = await loadReadableFullContext(ctx, textModel.contextWindow, input.question);
  } else {
    const generation = await db.query.aiIndexGenerations.findFirst({
      where: eq(schema.aiIndexGenerations.isActive, true),
    });
    if (!generation || generation.status !== 'ready')
      throw new DomainError('INDEX_NOT_READY', 'Semantic index is not ready');
    const embeddingModel = await db.query.aiModels.findFirst({
      where: eq(schema.aiModels.id, generation.modelId),
    });
    if (!embeddingModel) throw new DomainError('MODEL_NOT_FOUND', 'Embedding model not found');
    const embeddingProvider = await db.query.aiProviders.findFirst({
      where: eq(schema.aiProviders.id, embeddingModel.providerId),
    });
    if (!embeddingProvider?.enabled)
      throw new DomainError('PROVIDER_DISABLED', 'Embedding provider is disabled');
    const embedded = await createAiProviderAdapter(
      await providerRuntime(embeddingProvider.id),
    ).embed({
      actionId,
      modelExternalId: embeddingModel.externalId,
      inputs: [input.question],
      expectedDimensions: generation.embeddingDimensions,
      abortSignal: new AbortController().signal,
    });
    sources = searchResultsToSources(await retrieve(ctx, generation.id, embedded.vectors[0]!, 8));
    retrievalUsage = embedded.usage ?? {};
  }

  if (sources.length === 0) {
    await appendActionEvent(actionId, 'text_delta', { text: 'INSUFFICIENT_WIKI_EVIDENCE' });
    await finishAction(actionId, 'completed', {
      resultMetadata: { insufficientEvidence: true, citationCount: 0 },
    });
    // If this question came from Feishu, wake the delivery worker to send the
    // "no accessible material" answer promptly.
    await nudgeAnswerDelivery(actionId);
    return;
  }
  const prompt = buildWikiQuestionPrompt(input.question, sources, input.conversation);
  const adapter = createAiProviderAdapter(await providerRuntime(action.providerId));
  const feishuStream = await startFeishuAnswerStream(actionId);
  let answer = '';
  let usage: Record<string, unknown> = { ...retrievalUsage };
  try {
    for await (const event of adapter.streamText({
      actionId,
      modelExternalId: textModel.externalId,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      maxOutputTokens: textModel.maxOutputTokens ?? undefined,
      temperature: 0.1,
      abortSignal: new AbortController().signal,
    })) {
      if (await isCancellationRequested(actionId))
        throw new DomainError('CANCELLED', 'Question action was cancelled');
      if (event.type === 'delta') {
        answer += event.text;
        await appendActionEvent(actionId, 'text_delta', { text: event.text });
        await feishuStream?.stream.append(event.text);
      } else if (event.type === 'reasoning_delta') {
        await appendActionEvent(actionId, 'reasoning_delta', { text: event.text });
      } else if (event.type === 'usage') {
        usage = { ...usage, ...event };
      }
    }
    await assertAiFeature(ctx, 'question');
    const citations = isInsufficientAnswer(answer, sources)
      ? []
      : normalizeQuestionCitations(answer, sources);
    if (feishuStream) {
      await completeFeishuAnswerStream(feishuStream, actionId, toFeishuCitations(citations));
    }
    await appendActionEvent(actionId, 'citations', { citations });
    await finishAction(actionId, 'completed', {
      resultMetadata: {
        insufficientEvidence: isInsufficientAnswer(answer, sources),
        citationCount: citations.length,
      },
      usageMetadata: usage,
    });
  } catch (error) {
    if (feishuStream) await failFeishuAnswerStream(feishuStream, actionId);
    throw error;
  }
  // Deliver a Feishu-originated answer promptly (no-op for web-originated ones).
  await nudgeAnswerDelivery(actionId);
}
