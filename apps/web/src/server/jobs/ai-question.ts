import { eq } from 'drizzle-orm';
import type { AiCitation, AiQuestionMode, AiToolReviewDecision } from '@next-wiki/shared';
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
  normalizeQuestionCitations,
} from '@/server/ai/prompts/wiki-question';
import { AiProviderError, isContextLengthExceededError, normalizeProviderError } from '@/server/ai/types';
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
  ensureBuiltinProvider,
  getPolicyRowsByProvider,
  policyLayersFor,
  resolveEffectiveReviewPolicy,
  resolveReviewDecision,
  resolveToolEnabled,
} from '@/server/services/ai-tool-policy';
import { hasExecutor } from '@/server/services/ai-tool-executors';
import {
  createWorkflow,
  getWorkflowByAction,
  runToolLoop,
  transitionWorkflow,
  type ToolPlanner,
} from '@/server/services/ai-tool-runtime';
import { listToolDefinitions, type ToolDefinition } from '@/server/services/ai-tool-registry';
import { resolveAiRuntimeConfig } from '@/server/services/ai-runtime-settings';
import {
  nudgeAnswerDelivery,
  toFeishuCitations,
} from '@/server/services/feishu-notifications';
import {
  completeFeishuAnswerStream,
  failFeishuAnswerStream,
  startFeishuAnswerStream,
} from '@/server/services/feishu-answer-streams';
import { getCitationHref } from '@/lib/path';
import {
  buildPlannerUserPrompt,
  buildWikiToolSystemPrompt,
  extractTaggedThinking,
  parseToolPlan,
} from './wiki-question-tool-planner';

type QuestionInput = {
  question: string;
  mode: AiQuestionMode;
  currentPage?: { pageId: string; revisionId: string };
  conversation?: { question: string; answer: string }[];
};

type ToolEnabledQuestionInput = {
  question: string;
  mode?: AiQuestionMode;
  requestedReview?: AiToolReviewDecision;
  currentPage?: { pageId: string; revisionId: string };
  conversation?: { question: string; answer: string }[];
};

// How many times to shrink the attached sources and retry when the provider
// reports the request exceeded its context window. Sources are halved each
// time, so three retries send as little as ~1/8 of the original body.
const MAX_CONTEXT_COMPRESSION_RETRIES = 3;
const MAX_TOOL_PROTOCOL_RETRIES = 3;

/**
 * Keep a provider stream cancellable without imposing an arbitrary response
 * deadline. The browser's Stop control flags the action in PostgreSQL; this
 * lightweight watcher turns that durable flag into an AbortSignal for an
 * in-flight provider request.
 */
function watchActionCancellation(actionId: string) {
  const controller = new AbortController();
  let checking = false;
  const check = async () => {
    if (checking || controller.signal.aborted) return;
    checking = true;
    try {
      if (await isCancellationRequested(actionId)) controller.abort();
    } finally {
      checking = false;
    }
  };
  void check();
  const interval = setInterval(() => void check(), 250);
  return {
    signal: controller.signal,
    dispose: () => clearInterval(interval),
  };
}

function appendSourceLinks(answer: string, citations: AiCitation[]): string {
  if (citations.length === 0) return answer;
  const existing = new Set<string>();
  const lines: string[] = [];
  for (const citation of citations) {
    if (existing.has(citation.pageId)) continue;
    existing.add(citation.pageId);
    lines.push(`- [${citation.title}](${getCitationHref(citation)})`);
  }
  if (lines.length === 0) return answer;
  const body = answer.trimEnd();
  return `${body}${body ? '\n\n' : ''}Sources:\n${lines.join('\n')}`;
}

function mergeCitations(...groups: AiCitation[][]): AiCitation[] {
  const merged = new Map<string, AiCitation>();
  for (const citations of groups) {
    for (const citation of citations) {
      merged.set(`${citation.pageId}:${citation.revisionId}`, citation);
    }
  }
  return [...merged.values()];
}

export async function runWikiQuestionAction(actionId: string): Promise<void> {
  const input = await readActionInput<Partial<ToolEnabledQuestionInput>>(actionId);
  if (input && typeof input.requestedReview === 'string') {
    await runToolEnabledWikiQuestionAction(actionId);
    return;
  }
  await runPlainWikiQuestionAction(actionId);
}

async function runPlainWikiQuestionAction(actionId: string): Promise<void> {
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

  const retrieval = await loadWikiQuestionSources({
    ctx,
    actionId,
    question: input.question,
    mode: input.mode,
    textContextWindow: textModel.contextWindow,
  });
  const { sources, usage: retrievalUsage } = retrieval;

  const adapter = createAiProviderAdapter(await providerRuntime(action.providerId));
  const feishuStream = await startFeishuAnswerStream(actionId);
  let answer = '';
  let usage: Record<string, unknown> = { ...retrievalUsage };
  const cancellation = watchActionCancellation(actionId);
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
          abortSignal: cancellation.signal,
          timeoutMs: null,
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
    const citations = normalizeQuestionCitations(answer, promptSources);
    if (feishuStream) {
      await completeFeishuAnswerStream(feishuStream, actionId, toFeishuCitations(citations));
    }
    await appendActionEvent(actionId, 'citations', { citations });
    await finishAction(actionId, 'completed', {
      resultMetadata: {
        insufficientEvidence: false,
        citationCount: citations.length,
        ...(retrieval.degradation ? { retrievalDegraded: retrieval.degradation } : {}),
      },
      usageMetadata: usage,
    });
  } catch (error) {
    if (feishuStream) await failFeishuAnswerStream(feishuStream, actionId);
    throw error;
  } finally {
    cancellation.dispose();
  }
  // Deliver a Feishu-originated answer promptly (no-op for web-originated ones).
  await nudgeAnswerDelivery(actionId);
}

export async function runToolEnabledWikiQuestionAction(actionId: string): Promise<void> {
  const input = await readActionInput<ToolEnabledQuestionInput>(actionId);
  const action = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
  if (!input || !action?.actorUserId || !action.modelId || !action.providerId) {
    throw new DomainError('CANCELLED', 'Tool-enabled question input expired');
  }
  const [user, textModel] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, action.actorUserId) }),
    db.query.aiModels.findFirst({ where: eq(schema.aiModels.id, action.modelId) }),
  ]);
  if (!user || user.status !== 'active' || !textModel) {
    throw new DomainError('CANCELLED', 'Tool-enabled question action is no longer authorized');
  }
  const ctx = buildUserCtx(user.id, user.role);
  await assertAiFeature(ctx, 'question');
  await appendActionEvent(actionId, 'question', { text: input.question });
  const questionMode = input.mode ?? 'retrieval';
  const retrieval = await loadWikiQuestionSources({
    ctx,
    actionId,
    question: input.question,
    mode: questionMode,
    textContextWindow: textModel.contextWindow,
  });
  const { sources: wikiSources, usage: retrievalUsage } = retrieval;

  // Resolve effective policy for every tool once, up front.
  const provider = await ensureBuiltinProvider();
  const policyRows = await getPolicyRowsByProvider(provider.id);
  const isOwnerOrAdmin = user.role === 'admin';
  const isEnabled = (tool: ToolDefinition) =>
    resolveToolEnabled(tool, policyLayersFor(tool, policyRows), provider.enabled) && hasExecutor(tool.name);
  const resolveReview = (tool: ToolDefinition, requested: AiToolReviewDecision) =>
    resolveReviewDecision(
      tool,
      resolveEffectiveReviewPolicy(tool, policyLayersFor(tool, policyRows)),
      requested,
      isOwnerOrAdmin,
    );
  const enabledTools = listToolDefinitions().filter(isEnabled);
  const providerDefault = policyRows.find((row) => row.toolName == null && row.category == null);
  // Admin-tunable runtime config (Bots > General params, AI > Prompts prompts).
  const runtimeConfig = await resolveAiRuntimeConfig();
  const maxCalls = providerDefault?.maxCallsPerTurn ?? runtimeConfig.maxToolCalls;

  // Ensure the workflow record exists and is running.
  let workflow = (await getWorkflowByAction(actionId)) ?? null;
  if (!workflow) {
    workflow = await createWorkflow({ aiActionId: actionId, actorUserId: user.id, maxCalls });
  }
  if (workflow.status === 'queued') {
    workflow = await transitionWorkflow(workflow.id, 'running');
  }

  const adapter = createAiProviderAdapter(await providerRuntime(action.providerId));
  const system = buildWikiToolSystemPrompt(enabledTools, {
    assistantSystemPrompt: runtimeConfig.assistantSystemPrompt,
    toolSystemPrompt: runtimeConfig.toolSystemPrompt,
  });
  const cancellation = watchActionCancellation(actionId);
  const planner: ToolPlanner = async (state) => {
    const basePrompt = buildPlannerUserPrompt(state);
    for (let attempt = 0; attempt < MAX_TOOL_PROTOCOL_RETRIES; attempt += 1) {
      const retryInstruction = attempt > 0
        ? '\n\nYour previous tool-call block was invalid or truncated. Re-emit the complete tool call as valid JSON, using the exact documented argument names.'
        : '';
      const prompt = `${basePrompt}${retryInstruction}`;
      let output = '';
      try {
        for await (const event of adapter.streamText({
          actionId,
          modelExternalId: textModel.externalId,
          system,
          messages: [{ role: 'user', content: prompt }],
          maxOutputTokens: computeAnswerMaxOutputTokens(
            estimatePromptTokens(system, prompt),
            textModel.contextWindow,
            textModel.maxOutputTokens,
            runtimeConfig.plannerMaxOutputTokens,
          ),
          temperature: runtimeConfig.plannerTemperature,
          timeoutMs: null,
          abortSignal: cancellation.signal,
        })) {
          if (event.type === 'delta') output += event.text;
          else if (event.type === 'reasoning_delta') {
            await appendActionEvent(actionId, 'reasoning_delta', { text: event.text });
          }
        }
      } catch (error) {
        const normalized = normalizeProviderError(error);
        if (normalized.code === 'TIMEOUT') {
          throw new AiProviderError(
            'TIMEOUT',
            'The AI provider timed out while preparing the next Wiki action.',
            true,
          );
        }
        throw normalized;
      }
      const parsed = parseToolPlan(output);
      if (parsed.kind === 'tool_calls') {
        const taggedThinking = extractTaggedThinking(output);
        if (taggedThinking) {
          await appendActionEvent(actionId, 'reasoning_delta', { text: taggedThinking });
        }
      }
      if (parsed.kind !== 'invalid_tool_calls') return parsed;
    }
    throw new DomainError('INVALID_RESPONSE', 'The AI provider repeatedly returned an invalid tool call.');
  };

  let result;
  try {
    result = await runToolLoop({
      actionId,
      workflowId: workflow.id,
      ctx,
      actorUserId: user.id,
      question: input.question,
      conversation: input.conversation ?? [],
      wikiSources,
      planner,
      resolveReview,
      isEnabled,
      isCancelled: () => isCancellationRequested(actionId),
    });
  } catch (error) {
    const current = await getWorkflowByAction(actionId);
    const cancelled =
      (error instanceof AiProviderError && error.code === 'CANCELLED') ||
      (error instanceof DomainError && error.code === 'CANCELLED') ||
      (await isCancellationRequested(actionId));
    if (current?.status === 'running') await transitionWorkflow(current.id, cancelled ? 'cancelled' : 'failed');
    throw error;
  } finally {
    cancellation.dispose();
  }

  if (result.status === 'cancelled') {
    throw new DomainError('CANCELLED', 'Tool-enabled question was cancelled');
  }

  const answer =
    result.answer ||
    (result.status === 'limit_reached'
      ? 'I reached the tool-call limit for this turn before finishing.'
      : '');
  const wikiCitations = normalizeQuestionCitations(answer, wikiSources);
  const citations = mergeCitations(wikiCitations, result.citations);
  const finalAnswer = appendSourceLinks(answer, citations);
  if (finalAnswer) await appendActionEvent(actionId, 'text_delta', { text: finalAnswer });
  await appendActionEvent(actionId, 'citations', { citations });
  await finishAction(actionId, 'completed', {
    resultMetadata: {
      toolWorkflowStatus: result.status,
      insufficientEvidence: false,
      citationCount: citations.length,
      ...(retrieval.degradation ? { retrievalDegraded: retrieval.degradation } : {}),
    },
    usageMetadata: retrievalUsage,
  });
  await nudgeAnswerDelivery(actionId);
}
