import { eq } from 'drizzle-orm';
import type { AiQuestionMode } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { createAiProviderAdapter } from '@/server/ai/registry';
import {
  buildWikiQuestionPrompt,
  compressQuestionSources,
  computeAnswerMaxOutputTokens,
  estimatePromptTokens,
  isInsufficientAnswer,
  normalizeQuestionCitations,
} from '@/server/ai/prompts/wiki-question';
import { isContextLengthExceededError } from '@/server/ai/types';
import { loadWikiQuestionSources } from '@/server/ai/retrieval/wiki-question-sources';
import { providerRuntime } from '@/server/services/ai-admin';
import { assertAiFeature } from '@/server/services/ai-entitlements';
import {
  appendActionEvent,
  finishAction,
  isCancellationRequested,
  readActionInput,
} from '@/server/services/ai-actions';
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

// How many times to shrink the attached sources and retry when the provider
// reports the request exceeded its context window. Sources are halved each
// time, so three retries send as little as ~1/8 of the original body.
const MAX_CONTEXT_COMPRESSION_RETRIES = 3;

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

  const { sources, usage: retrievalUsage } = await loadWikiQuestionSources({
    ctx,
    actionId,
    question: input.question,
    mode: input.mode,
    textContextWindow: textModel.contextWindow,
  });

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
  const adapter = createAiProviderAdapter(await providerRuntime(action.providerId));
  const feishuStream = await startFeishuAnswerStream(actionId);
  let answer = '';
  let usage: Record<string, unknown> = { ...retrievalUsage };
  // Sources actually sent to the model. A context-overflow retry compresses
  // these, and citations must resolve against whatever the model finally saw.
  let promptSources = sources;
  try {
    for (let attempt = 0; ; attempt += 1) {
      const prompt = buildWikiQuestionPrompt(input.question, promptSources, input.conversation);
      const maxOutputTokens = computeAnswerMaxOutputTokens(
        estimatePromptTokens(prompt.system, prompt.user),
        textModel.contextWindow,
        textModel.maxOutputTokens,
      );
      try {
        for await (const event of adapter.streamText({
          actionId,
          modelExternalId: textModel.externalId,
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.user }],
          maxOutputTokens,
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
        break;
      } catch (error) {
        // Retry only when nothing has streamed yet (so we never duplicate
        // output) and the failure is specifically an over-long request whose
        // attached sources we can shrink.
        const compressed =
          answer === '' &&
          attempt < MAX_CONTEXT_COMPRESSION_RETRIES &&
          isContextLengthExceededError(error)
            ? compressQuestionSources(promptSources)
            : null;
        if (!compressed || compressed.length === 0) throw error;
        promptSources = compressed;
        usage = { ...retrievalUsage };
        continue;
      }
    }
    await assertAiFeature(ctx, 'question');
    const citations = isInsufficientAnswer(answer, promptSources)
      ? []
      : normalizeQuestionCitations(answer, promptSources);
    if (feishuStream) {
      await completeFeishuAnswerStream(feishuStream, actionId, toFeishuCitations(citations));
    }
    await appendActionEvent(actionId, 'citations', { citations });
    await finishAction(actionId, 'completed', {
      resultMetadata: {
        insufficientEvidence: isInsufficientAnswer(answer, promptSources),
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
