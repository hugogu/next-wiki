import { eq, inArray } from 'drizzle-orm';
import {
  scheduledAiJobScopeSchema,
  type AiCitation,
  type AiQuestionMode,
  type ResearchMode,
  type AiToolReviewDecision,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildAnonymousCtx, buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { createAiProviderAdapter } from '@/server/ai/registry';
import {
  buildWikiQuestionPrompt,
  buildWikiToolAnswerPrompt,
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
import { requireWebResearchConfiguration } from '@/server/web-research/policy';
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
  boundTranscript,
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
import { loadWebConversationContext } from '@/server/services/ai-conversation-context';
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
  research?: { mode: ResearchMode; externalResearchConsent: boolean };
};

// How many times to shrink the attached sources and retry when the provider
// reports the request exceeded its context window. Sources are halved each
// time, so three retries send as little as ~1/8 of the original body.
const MAX_CONTEXT_COMPRESSION_RETRIES = 3;
const REASONING_EVENT_BATCH_BYTES = 1024;

/**
 * Providers may stream one reasoning character at a time. Persisting every
 * fragment creates tens of thousands of rows and makes SSE replay lag behind
 * the action. Send the first fragment immediately so the UI becomes live, then
 * coalesce the rest into bounded chunks. Call `flush` at a semantic boundary
 * (before a tool call/final result) so ordering remains intact.
 */
export function createBatchedReasoningAppender(
  append: (text: string) => Promise<void>,
  maxBytes = REASONING_EVENT_BATCH_BYTES,
) {
  let buffered = '';
  let emittedInitial = false;

  const flush = async () => {
    if (!buffered) return;
    const text = buffered;
    buffered = '';
    emittedInitial = true;
    await append(text);
  };

  return {
    append: async (text: string) => {
      if (!text) return;
      buffered += text;
      if (!emittedInitial || Buffer.byteLength(buffered) >= maxBytes) await flush();
    },
    flush,
  };
}

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
      merged.set(
        citation.kind === 'web'
          ? `${citation.sourceId}:${citation.contentHash ?? citation.retrievedAt}`
          : `${citation.pageId}:${citation.revisionId}`,
        citation,
      );
    }
  }
  return [...merged.values()];
}

type UsageEvent = {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
};

function accumulateUsage(target: Record<string, number>, event: UsageEvent): void {
  for (const key of ['inputTokens', 'outputTokens', 'cachedInputTokens'] as const) {
    if (typeof event[key] === 'number') target[key] = (target[key] ?? 0) + event[key];
  }
}

function mergeUsage(...groups: Array<Record<string, unknown>>): Record<string, number> {
  const total: Record<string, number> = {};
  for (const group of groups) accumulateUsage(total, group);
  return total;
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
  if (!input || !action?.modelId || !action.providerId) {
    throw new DomainError('CANCELLED', 'Question input expired');
  }
  const [user, textModel] = await Promise.all([
    action.actorUserId
      ? db.query.users.findFirst({ where: eq(schema.users.id, action.actorUserId) })
      : Promise.resolve(null),
    db.query.aiModels.findFirst({ where: eq(schema.aiModels.id, action.modelId) }),
  ]);
  if ((action.actorUserId && (!user || user.status !== 'active')) || !textModel)
    throw new DomainError('CANCELLED', 'Question action is no longer authorized');
  const ctx = user ? buildUserCtx(user.id, user.role) : buildAnonymousCtx();
  await assertAiFeature(ctx, 'question');
  const conversation = user
    ? await loadWebConversationContext({
        actorUserId: user.id,
        queuedAt: action.queuedAt,
        requestMetadata: action.requestMetadata,
        clientConversation: input.conversation,
      })
    : input.conversation ?? [];

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
  const reasoning = createBatchedReasoningAppender(
    async (text) => {
      await appendActionEvent(actionId, 'reasoning_delta', { text });
    },
  );
  // Sources actually sent to the model. A context-overflow retry compresses
  // these, and citations must resolve against whatever the model finally saw.
  let promptSources = sources;
  try {
    for (let attempt = 0; ; attempt += 1) {
      const prompt = buildWikiQuestionPrompt(
        input.question,
        promptSources,
        conversation,
        runtimeConfig.answerLanguage,
        runtimeConfig.assistantSystemPrompt,
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
            await reasoning.flush();
            answer += event.text;
            await appendActionEvent(actionId, 'text_delta', { text: event.text });
            await feishuStream?.stream.append(event.text);
          } else if (event.type === 'reasoning_delta') {
            await reasoning.append(event.text);
          } else if (event.type === 'usage') {
            usage = { ...usage, ...event };
          }
        }
        await reasoning.flush();
        break;
      } catch (error) {
        await reasoning.flush();
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
  const metadata = action.requestMetadata as Record<string, unknown>;
  // New actions snapshot the configured planner model at queue time. Older
  // queued actions have no snapshot and deliberately retain their historical
  // behavior by using the answer model for both stages.
  const plannerModelId =
    typeof metadata.plannerModelId === 'string' ? metadata.plannerModelId : textModel.id;
  const plannerModel =
    plannerModelId === textModel.id
      ? textModel
      : await db.query.aiModels.findFirst({ where: eq(schema.aiModels.id, plannerModelId) });
  if (!plannerModel || plannerModel.availability !== 'available') {
    throw new DomainError('AI_NOT_CONFIGURED', 'The configured Wiki AI tool planner model is unavailable');
  }
  const plannerUsesDedicatedModel = metadata.plannerUsesDedicatedModel === true;
  const ctx = buildUserCtx(user.id, user.role);
  await assertAiFeature(ctx, 'question');
  const webResearch = input.research?.mode === 'wiki_first_web';
  if (webResearch) {
    if (!input.research?.externalResearchConsent) {
      throw new DomainError('WEB_RESEARCH_CONSENT_REQUIRED', 'External research confirmation is required');
    }
    await assertAiFeature(ctx, 'web_research');
    await requireWebResearchConfiguration();
  }
  const conversation = await loadWebConversationContext({
    actorUserId: user.id,
    queuedAt: action.queuedAt,
    requestMetadata: action.requestMetadata,
    clientConversation: input.conversation,
  });
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
  // In 'retrieval' mode (the default for tool-enabled chat), skip the eager
  // full_text+fuzzy+semantic search that used to run before the model ever
  // saw the question — most questions asked of "Wiki AI" don't need Wiki
  // content at all, and paying for three search engines up front regardless
  // of relevance only added latency and a misleading "Searching the Wiki…"
  // status. The model decides for itself via search_wiki/get_page (see the
  // "no baseline sources" guidance in buildPlannerUserPrompt) and a scheduled
  // job already skips baseline retrieval for the same reason its own scope
  // governs what it may read. 'full' mode is unaffected: it explicitly loads
  // the whole readable corpus up front by design.
  const retrieval =
    scheduledScope || questionMode === 'retrieval'
      ? { sources: [], usage: {}, results: [] }
      : await loadWikiQuestionSources({
          ctx,
          actionId,
          question: input.question,
          mode: questionMode,
          textContextWindow: textModel.contextWindow,
        });
  const { sources: wikiSources, usage: retrievalUsage, results: retrievalResults } = retrieval;
  if (retrievalResults.length > 0) {
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
  const enabledTools = listToolDefinitions()
    .filter(isEnabled)
    .filter((tool) => {
      if (!webResearch) return tool.category !== 'web';
      return tool.riskLevel === 'read' && ['read', 'tag', 'skill', 'web'].includes(tool.category);
    });
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

  const plannerAdapter = createAiProviderAdapter(await providerRuntime(plannerModel.providerId));
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
      webResearchPolicyPrompt: runtimeConfig.webResearchPolicyPrompt,
      answerLanguage: runtimeConfig.answerLanguage,
      researchMode: webResearch ? 'wiki_first_web' : 'wiki_only',
    },
    enabledSkills.map((skill) => ({ name: skill.name, description: skill.description })),
  );
  const cancellation = watchActionCancellation(actionId);
  // Streaming usage accumulated across every planner iteration. A tool-enabled
  // answer can take several LLM turns; summing the per-iteration tokens gives
  // the admin usage panel an accurate per-action total instead of just the
  // last call's usage (or nothing at all if the field was never wired).
  const plannerUsage: Record<string, number> = {};
  const accumulatePlannerUsage = (event: UsageEvent) => accumulateUsage(plannerUsage, event);
  const plannerReasoning = createBatchedReasoningAppender(
    async (text) => {
      await appendActionEvent(actionId, 'reasoning_delta', { text });
    },
  );
  const plannerDeps = {
    adapter: plannerAdapter,
    actionId,
    modelExternalId: plannerModel.externalId,
    system,
    plannerUserPrompt: runtimeConfig.plannerUserPrompt,
    temperature: runtimeConfig.plannerTemperature,
    abortSignal: cancellation.signal,
    maxOutputTokens: (systemPrompt: string, prompt: string) =>
      computeAnswerMaxOutputTokens(
        estimatePromptTokens(systemPrompt, prompt),
        plannerModel.contextWindow,
        plannerModel.maxOutputTokens,
        runtimeConfig.plannerMaxOutputTokens,
    ),
    onReasoning: async (text: string) => {
      await plannerReasoning.append(text);
    },
    onUsage: accumulatePlannerUsage,
  };
  // Which strategy this model uses. Both planners return the same ToolPlanStep,
  // so nothing below here — policy, review, audit, chat events — can tell them
  // apart (028, FR-004).
  const strategy = resolveToolCallStrategy({
    strategy: plannerModel.toolCallStrategy,
    nativeFailedAt: plannerModel.nativeToolCallFailedAt,
    adapterSupportsNativeTools: plannerAdapter.supportsNativeTools,
  });
  logger.info('tool-call strategy resolved', {
    actionId,
    modelId: plannerModel.id,
    strategy: strategy.strategy,
    reason: strategy.reason,
  });
  const textPlanner = createTextProtocolPlanner(plannerDeps);
  const nativePlanner = createNativeToolPlanner({
    ...plannerDeps,
    tools: (state) => enabledTools.filter((tool) => {
      if (state.unavailableToolNames?.includes(tool.name)) return false;
      // A known page is safe to read directly. The whole-Wiki search remains
      // mandatory before external research or a final answer, but need not
      // delay reading the current page or another exact page reference.
      return !webResearch || state.wikiSearchAttempted || tool.name === 'search_wiki' || tool.name === 'get_page';
    }),
  });
  // A model that advertises tool support but rejects the payload must not cost
  // the user their turn: downgrade for next time and finish this one on the
  // text protocol.
  let useNative = strategy.strategy === 'native';
  const planner: ToolPlanner = async (state) => {
    try {
      if (!useNative) return await textPlanner(state);
      try {
        return await nativePlanner(state);
      } catch (error) {
        if (!isNativeToolUnsupportedError(error)) throw error;
        useNative = false;
        await markNativeToolCallFailed(plannerModel.id);
        return await textPlanner(state);
      }
    } finally {
      await plannerReasoning.flush();
    }
  };

  let result: Awaited<ReturnType<typeof runToolLoop>>;
  try {
    result = await runToolLoop({
      actionId,
      workflowId: workflow.id,
      ctx,
      actorUserId: user.id,
      question,
      conversation,
      wikiSources,
      currentPage: input.currentPage,
      researchMode: webResearch ? 'wiki_first_web' : 'wiki_only',
      planner,
      resolveReview,
      isEnabled,
      isCancelled: () => isCancellationRequested(actionId),
      transcriptCharBudget: transcriptCharBudgetFor(plannerModel.contextWindow),
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
  }

  try {
    if (result.status === 'cancelled') {
      throw new DomainError('CANCELLED', 'Tool-enabled question was cancelled');
    }

    let answer = '';
    const answerUsage: Record<string, number> = {};
    if (plannerUsesDedicatedModel) {
      // Do not show the planner's prose. It may contain protocol-facing notes
      // or a terse conclusion intended only to terminate the loop; the answer
      // model receives the bounded evidence and writes the user-facing result.
      const finalTranscript = boundTranscript(
        [
          ...result.transcript,
          ...(result.status === 'limit_reached'
            ? ['TOOL_WORKFLOW_LIMIT_REACHED: State clearly that the research or requested work may be incomplete.']
            : []),
        ],
        transcriptCharBudgetFor(textModel.contextWindow),
      );
      const prompt = buildWikiToolAnswerPrompt({
        question,
        sources: wikiSources,
        transcript: finalTranscript,
        conversation,
        answerLanguage: runtimeConfig.answerLanguage,
        assistantSystemPrompt: runtimeConfig.assistantSystemPrompt,
        toolAnswerPrompt: runtimeConfig.toolAnswerPrompt,
      });
      const answerAdapter = createAiProviderAdapter(await providerRuntime(action.providerId));
      const answerReasoning = createBatchedReasoningAppender(
        async (text) => {
          await appendActionEvent(actionId, 'reasoning_delta', { text });
        },
      );
      for await (const event of streamTextWithRetry(
        () =>
          answerAdapter.streamText({
            actionId,
            modelExternalId: textModel.externalId,
            system: prompt.system,
            messages: [{ role: 'user', content: prompt.user }],
            maxOutputTokens: computeAnswerMaxOutputTokens(
              estimatePromptTokens(prompt.system, prompt.user),
              textModel.contextWindow,
              textModel.maxOutputTokens,
            ),
            temperature: 0.1,
            abortSignal: cancellation.signal,
            timeoutMs: null,
          }),
        { signal: cancellation.signal },
      )) {
        if (await isCancellationRequested(actionId)) {
          throw new DomainError('CANCELLED', 'Tool-enabled question was cancelled');
        }
        if (event.type === 'delta') {
          await answerReasoning.flush();
          answer += event.text;
          await appendActionEvent(actionId, 'text_delta', { text: event.text });
        } else if (event.type === 'reasoning_delta') {
          await answerReasoning.append(event.text);
        } else if (event.type === 'usage') {
          accumulateUsage(answerUsage, event);
        }
      }
      await answerReasoning.flush();
    } else {
      // No planner assignment is an explicit backwards-compatible mode: the
      // answer model performs the tool loop and its terminal text is shown.
      answer =
        result.answer ||
        (result.status === 'limit_reached'
          ? 'I reached the tool-call limit for this turn before finishing, so this covers only part of what you asked for. Tell me which pages to continue with and I will pick up from there.'
          : '');
      if (answer) await appendActionEvent(actionId, 'text_delta', { text: answer });
    }

    if (!answer.trim()) {
      answer = 'I could not produce a final answer for this turn. Please try again.';
      await appendActionEvent(actionId, 'text_delta', { text: answer });
    }
    const wikiCitations = normalizeQuestionCitations(answer, wikiSources);
    const citations = mergeCitations(wikiCitations, result.citations);
    // The answer text carries no source list of its own: citations travel as
    // structured data and every surface (chat pane, session view, Feishu card)
    // renders them once from that. Baking a Markdown "Sources:" block into the
    // text — which the streaming retrieval path never did — showed each cited
    // page twice.
    await appendActionEvent(actionId, 'citations', { citations });
    await finishAction(actionId, 'completed', {
      resultMetadata: {
        toolWorkflowStatus: result.status,
        plannerModelId: plannerModel.id,
        plannerProviderId: plannerModel.providerId,
        dedicatedPlanner: plannerUsesDedicatedModel,
        insufficientEvidence: false,
        citationCount: citations.length,
        ...(retrieval.degradation ? { retrievalDegraded: retrieval.degradation } : {}),
      },
      usageMetadata: {
        ...mergeUsage(retrievalUsage, plannerUsage, answerUsage),
        planner: plannerUsage,
        answer: answerUsage,
      },
    });
    await nudgeAnswerDelivery(actionId);
  } finally {
    cancellation.dispose();
  }
}
