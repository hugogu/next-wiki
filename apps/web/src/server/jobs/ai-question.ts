import { eq, inArray } from 'drizzle-orm';
import {
  scheduledAiJobScopeSchema,
  type AiCitation,
  type AiQuestionMode,
  type AiToolReviewDecision,
} from '@next-wiki/shared';
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
import {
  AiProviderError,
  isContextLengthExceededError,
  isNativeToolUnsupportedError,
  streamTextWithRetry,
} from '@/server/ai/types';
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
  DEFAULT_TRANSCRIPT_CHARS,
  createWorkflow,
  getWorkflowByAction,
  runToolLoop,
  transitionWorkflow,
  type ToolPlanner,
} from '@/server/services/ai-tool-runtime';
import { listToolDefinitions, type ToolDefinition } from '@/server/services/ai-tool-registry';
import { resolveAiRuntimeConfig } from '@/server/services/ai-runtime-settings';
import { nudgeAnswerDelivery, toFeishuCitations } from '@/server/services/feishu-notifications';
import {
  completeFeishuAnswerStream,
  failFeishuAnswerStream,
  startFeishuAnswerStream,
} from '@/server/services/feishu-answer-streams';
import { logger } from '@/server/logger';
import { runWithoutDataCache } from '@/server/cache/public-cache';
import { listEnabledSkills } from '@/server/services/skills/registry';
import { buildWikiToolSystemPrompt } from './wiki-question-tool-planner';
import { expandScheduledJobContext } from './scheduled-ai-job-context';
import {
  createNativeToolPlanner,
  createTextProtocolPlanner,
} from '@/server/services/ai-tool-planners';
import {
  markNativeToolCallFailed,
  resolveToolCallStrategy,
} from '@/server/services/ai-tool-strategy';

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

/**
 * Transcript budget for a model whose context window we know.
 *
 * A third of the window, counted at one token per character — the worst case,
 * which is CJK — so accumulated tool output cannot crowd out the sources, the
 * conversation, and the answer it is meant to inform. Falls back to the
 * conservative default when a model reports no window.
 */
function transcriptCharBudgetFor(contextWindow: number | null): number {
  if (!contextWindow || contextWindow <= 0) return DEFAULT_TRANSCRIPT_CHARS;
  return Math.max(8_000, Math.floor(contextWindow / 3));
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

export function runWikiQuestionAction(actionId: string): Promise<void> {
  return runWithoutDataCache(() => runWikiQuestionActionWithoutDataCache(actionId));
}

async function runWikiQuestionActionWithoutDataCache(actionId: string): Promise<void> {
  const input = await readActionInput<Partial<ToolEnabledQuestionInput>>(actionId);
  if (input && typeof input.requestedReview === 'string') {
    await runToolEnabledWikiQuestionActionWithoutDataCache(actionId);
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
  const { sources, usage: retrievalUsage, results: retrievalResults } = retrieval;
  if (input.mode !== 'full') {
    await appendActionEvent(actionId, 'search_results', { results: retrievalResults });
  }

  const adapter = createAiProviderAdapter(await providerRuntime(action.providerId));
  const runtimeConfig = await resolveAiRuntimeConfig();
  const feishuStream = await startFeishuAnswerStream(actionId);
  let answer = '';
  let usage: Record<string, unknown> = { ...retrievalUsage };
  const cancellation = watchActionCancellation(actionId);
  // Sources actually sent to the model. A context-overflow retry compresses
  // these, and citations must resolve against whatever the model finally saw.
  let promptSources = sources;
  try {
    for (let attempt = 0; ; attempt += 1) {
      const prompt = buildWikiQuestionPrompt(
        input.question,
        promptSources,
        input.conversation,
        runtimeConfig.answerLanguage,
      );
      const maxOutputTokens = computeAnswerMaxOutputTokens(
        estimatePromptTokens(prompt.system, prompt.user),
        textModel.contextWindow,
        textModel.maxOutputTokens,
      );
      try {
        for await (const event of streamTextWithRetry(
          () =>
            adapter.streamText({
              actionId,
              modelExternalId: textModel.externalId,
              system: prompt.system,
              messages: [{ role: 'user', content: prompt.user }],
              maxOutputTokens,
              temperature: 0.1,
              abortSignal: cancellation.signal,
              timeoutMs: null,
            }),
          { signal: cancellation.signal },
        )) {
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

export function runToolEnabledWikiQuestionAction(actionId: string): Promise<void> {
  return runWithoutDataCache(() => runToolEnabledWikiQuestionActionWithoutDataCache(actionId));
}

async function runToolEnabledWikiQuestionActionWithoutDataCache(actionId: string): Promise<void> {
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
  const metadata = action.requestMetadata as Record<string, unknown>;
  const scheduledRunId =
    typeof metadata.scheduledAiJobRunId === 'string' ? metadata.scheduledAiJobRunId : null;
  const scheduledRun = scheduledRunId
    ? await db.query.scheduledAiJobRuns.findFirst({
        where: eq(schema.scheduledAiJobRuns.id, scheduledRunId),
      })
    : null;
  const snapshot = scheduledRun?.definitionSnapshot as { targetScope?: unknown } | undefined;
  const scheduledScope = snapshot?.targetScope
    ? scheduledAiJobScopeSchema.parse(snapshot.targetScope)
    : undefined;
  const questionMode = input.mode ?? 'retrieval';
  const retrieval = scheduledScope
    ? { sources: [], usage: {}, results: [] }
    : await loadWikiQuestionSources({
        ctx,
        actionId,
        question: input.question,
        mode: questionMode,
        textContextWindow: textModel.contextWindow,
      });
  const { sources: wikiSources, usage: retrievalUsage, results: retrievalResults } = retrieval;
  if (questionMode !== 'full') {
    await appendActionEvent(actionId, 'search_results', { results: retrievalResults });
  }

  // Resolve effective policy for every tool once, up front.
  const provider = await ensureBuiltinProvider();
  const policyRows = await getPolicyRowsByProvider(provider.id);
  const isOwnerOrAdmin = user.role === 'admin';
  const isEnabled = (tool: ToolDefinition) =>
    resolveToolEnabled(tool, policyLayersFor(tool, policyRows), provider.enabled) &&
    hasExecutor(tool.name);
  const resolveReview = (tool: ToolDefinition, requested: AiToolReviewDecision) =>
    action.feature === 'scheduled_ai_job'
      ? 'admin_review'
      : resolveReviewDecision(
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
  // Only names and descriptions: the model pulls full skill content on demand
  // through load_skill, so 20 installed skills cost 20 lines, not 20 documents.
  const enabledSkills = (await listEnabledSkills()).filter(
    (skill) => !scheduledScope || scheduledScope.skillNames.includes(skill.name),
  );
  const scheduledWritableSpaces =
    scheduledScope && scheduledScope.spaceIds.length > 0
      ? await db
          .select({ name: schema.spaces.name, slug: schema.spaces.slug })
          .from(schema.spaces)
          .where(inArray(schema.spaces.id, scheduledScope.spaceIds))
      : [];
  const scheduledContext = {
    tools: enabledTools,
    skills: enabledSkills,
    spaces: scheduledWritableSpaces,
  };
  const expandedQuestion = scheduledScope
    ? expandScheduledJobContext(input.question, scheduledContext)
    : input.question;
  // The task author may include {{scope}} wherever it reads best. When they
  // do not, still give the planner its durable read/write boundary.
  const question =
    scheduledScope && !/\{\{\s*scope\s*\}\}/i.test(input.question)
      ? `${expandedQuestion}\n\nRuntime access boundary:\n${expandScheduledJobContext('{{scope}}', scheduledContext)}`
      : expandedQuestion;
  await appendActionEvent(actionId, 'question', { text: question });
  const system = buildWikiToolSystemPrompt(
    enabledTools,
    {
      assistantSystemPrompt: runtimeConfig.assistantSystemPrompt,
      toolSystemPrompt: runtimeConfig.toolSystemPrompt,
      answerLanguage: runtimeConfig.answerLanguage,
    },
    enabledSkills.map((skill) => ({ name: skill.name, description: skill.description })),
  );
  const cancellation = watchActionCancellation(actionId);
  // Streaming usage accumulated across every planner iteration. A tool-enabled
  // answer can take several LLM turns; summing the per-iteration tokens gives
  // the admin usage panel an accurate per-action total instead of just the
  // last call's usage (or nothing at all if the field was never wired).
  const plannerUsage: Record<string, number> = {};
  const accumulatePlannerUsage = (event: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
  }) => {
    if (typeof event.inputTokens === 'number') plannerUsage.inputTokens = event.inputTokens;
    if (typeof event.outputTokens === 'number') {
      plannerUsage.outputTokens = (plannerUsage.outputTokens ?? 0) + event.outputTokens;
    }
    if (typeof event.cachedInputTokens === 'number') {
      plannerUsage.cachedInputTokens =
        (plannerUsage.cachedInputTokens ?? 0) + event.cachedInputTokens;
    }
  };
  const plannerDeps = {
    adapter,
    actionId,
    modelExternalId: textModel.externalId,
    system,
    temperature: runtimeConfig.plannerTemperature,
    abortSignal: cancellation.signal,
    maxOutputTokens: (systemPrompt: string, prompt: string) =>
      computeAnswerMaxOutputTokens(
        estimatePromptTokens(systemPrompt, prompt),
        textModel.contextWindow,
        textModel.maxOutputTokens,
        runtimeConfig.plannerMaxOutputTokens,
      ),
    onReasoning: async (text: string) => {
      await appendActionEvent(actionId, 'reasoning_delta', { text });
    },
    onUsage: accumulatePlannerUsage,
  };
  // Which strategy this model uses. Both planners return the same ToolPlanStep,
  // so nothing below here — policy, review, audit, chat events — can tell them
  // apart (028, FR-004).
  const strategy = resolveToolCallStrategy({
    strategy: textModel.toolCallStrategy,
    nativeFailedAt: textModel.nativeToolCallFailedAt,
    adapterSupportsNativeTools: adapter.supportsNativeTools,
  });
  logger.info('tool-call strategy resolved', {
    actionId,
    modelId: textModel.id,
    strategy: strategy.strategy,
    reason: strategy.reason,
  });
  const textPlanner = createTextProtocolPlanner(plannerDeps);
  const nativePlanner = createNativeToolPlanner({ ...plannerDeps, tools: () => enabledTools });
  // A model that advertises tool support but rejects the payload must not cost
  // the user their turn: downgrade for next time and finish this one on the
  // text protocol.
  let useNative = strategy.strategy === 'native';
  const planner: ToolPlanner = async (state) => {
    if (!useNative) return textPlanner(state);
    try {
      return await nativePlanner(state);
    } catch (error) {
      if (!isNativeToolUnsupportedError(error)) throw error;
      useNative = false;
      await markNativeToolCallFailed(textModel.id);
      return textPlanner(state);
    }
  };

  let result;
  try {
    result = await runToolLoop({
      actionId,
      workflowId: workflow.id,
      ctx,
      actorUserId: user.id,
      question,
      conversation: input.conversation ?? [],
      wikiSources,
      currentPage: input.currentPage,
      planner,
      resolveReview,
      isEnabled,
      isCancelled: () => isCancellationRequested(actionId),
      transcriptCharBudget: transcriptCharBudgetFor(textModel.contextWindow),
      toolResultMaxChars: runtimeConfig.toolResultMaxChars,
      scheduledScope,
      scheduledSkillNames: scheduledScope?.skillNames,
      scheduledAiJobRunId: scheduledRun?.id,
    });
  } catch (error) {
    const current = await getWorkflowByAction(actionId);
    const cancelled =
      (error instanceof AiProviderError && error.code === 'CANCELLED') ||
      (error instanceof DomainError && error.code === 'CANCELLED') ||
      (await isCancellationRequested(actionId));
    if (current?.status === 'running')
      await transitionWorkflow(current.id, cancelled ? 'cancelled' : 'failed');
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
      ? 'I reached the tool-call limit for this turn before finishing, so this covers only part of what you asked for. Tell me which pages to continue with and I will pick up from there.'
      : '');
  const wikiCitations = normalizeQuestionCitations(answer, wikiSources);
  const citations = mergeCitations(wikiCitations, result.citations);
  // The answer text carries no source list of its own: citations travel as
  // structured data and every surface (chat pane, session view, Feishu card)
  // renders them once from that. Baking a Markdown "Sources:" block into the
  // text — which the streaming retrieval path never did — showed each cited
  // page twice.
  if (answer) await appendActionEvent(actionId, 'text_delta', { text: answer });
  await appendActionEvent(actionId, 'citations', { citations });
  await finishAction(actionId, 'completed', {
    resultMetadata: {
      toolWorkflowStatus: result.status,
      insufficientEvidence: false,
      citationCount: citations.length,
      ...(retrieval.degradation ? { retrievalDegraded: retrieval.degradation } : {}),
    },
    usageMetadata: { ...retrievalUsage, ...plannerUsage },
  });
  await nudgeAnswerDelivery(actionId);
}
