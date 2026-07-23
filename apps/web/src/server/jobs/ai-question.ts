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
import { buildPlannerUserPrompt, parseToolPlan } from './wiki-question-tool-planner';

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
const DEFAULT_TOOL_MAX_CALLS = 100;
const MAX_TOOL_PROTOCOL_RETRIES = 3;

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

/** System prompt describing the available tools and the provider-agnostic
 * JSON tool-call protocol the model drives over ordinary text streaming. */
function buildToolSystemPrompt(tools: ToolDefinition[]): string {
  const toolList = tools.map((tool) => `- ${tool.name} (${tool.category}): ${tool.description}`).join('\n');
  return [
    'You are Wiki AI. You can inspect and prepare governed changes to this wiki using tools.',
    'Available tools:',
    toolList,
    '',
    'To use tools, reply with ONLY a fenced code block and nothing else:',
    '```tool',
    '{"tool_calls":[{"tool":"search_wiki","arguments":{"query":"..."},"review":"none"}]}',
    '```',
    'Set "review" to "admin_review" for changes that should be reviewed. After you',
    'receive tool results, either call more tools the same way, or write your final',
    'answer as plain prose (no code block), citing the pages you read.',
    'Baseline Wiki sources are provided in the user prompt. For informational',
    'questions, use those sources first and cite factual claims with source ids',
    'in plain ASCII brackets exactly like [S1]. Do not answer from general model',
    'knowledge when the Wiki sources and tool-read pages do not support it;',
    'reply with INSUFFICIENT_WIKI_EVIDENCE instead.',
    'If the user asks to save, write, or turn previous conversation content into a',
    'wiki page, use create_page or save_draft with admin_review instead of only',
    'answering conversationally.',
    'For create_page, use arguments path, title, and contentSource.',
    'Never guess a page path for get_page. Use the baseline sources, search_wiki,',
    'or list_pages first, then pass an exact returned path or pageId to get_page.',
  ].join('\n');
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
  const { sources: wikiSources, usage: retrievalUsage } = await loadWikiQuestionSources({
    ctx,
    actionId,
    question: input.question,
    mode: questionMode,
    textContextWindow: textModel.contextWindow,
  });

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
  const maxCalls = providerDefault?.maxCallsPerTurn ?? DEFAULT_TOOL_MAX_CALLS;

  // Ensure the workflow record exists and is running.
  let workflow = (await getWorkflowByAction(actionId)) ?? null;
  if (!workflow) {
    workflow = await createWorkflow({ aiActionId: actionId, actorUserId: user.id, maxCalls });
  }
  if (workflow.status === 'queued') {
    workflow = await transitionWorkflow(workflow.id, 'running');
  }

  const adapter = createAiProviderAdapter(await providerRuntime(action.providerId));
  const system = buildToolSystemPrompt(enabledTools);
  const planner: ToolPlanner = async (state) => {
    const basePrompt = buildPlannerUserPrompt(state);
    for (let attempt = 0; attempt < MAX_TOOL_PROTOCOL_RETRIES; attempt += 1) {
      const retryInstruction = attempt > 0
        ? '\n\nYour previous tool-call block was invalid or truncated. Re-emit the complete tool call as valid JSON, using the exact documented argument names.'
        : '';
      const prompt = `${basePrompt}${retryInstruction}`;
      let output = '';
      for await (const event of adapter.streamText({
        actionId,
        modelExternalId: textModel.externalId,
        system,
        messages: [{ role: 'user', content: prompt }],
        maxOutputTokens: computeAnswerMaxOutputTokens(
          estimatePromptTokens(system, prompt),
          textModel.contextWindow,
          textModel.maxOutputTokens,
        ),
        temperature: 0.1,
        abortSignal: new AbortController().signal,
      })) {
        if (event.type === 'delta') output += event.text;
      }
      const parsed = parseToolPlan(output);
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
    if (current?.status === 'running') await transitionWorkflow(current.id, 'failed');
    throw error;
  }

  if (result.status === 'cancelled') {
    throw new DomainError('CANCELLED', 'Tool-enabled question was cancelled');
  }

  let answer =
    result.answer ||
    (result.status === 'limit_reached'
      ? 'I reached the tool-call limit for this turn before finishing.'
      : '');
  if (
    wikiSources.length === 0 &&
    result.calls === 0 &&
    answer.trim() &&
    answer.trim() !== 'INSUFFICIENT_WIKI_EVIDENCE'
  ) {
    answer = 'INSUFFICIENT_WIKI_EVIDENCE';
  }
  const insufficientEvidence = answer.trim() === 'INSUFFICIENT_WIKI_EVIDENCE';
  const wikiCitations = insufficientEvidence
    ? []
    : normalizeQuestionCitations(answer, wikiSources);
  const citations = mergeCitations(wikiCitations, result.citations);
  const finalAnswer = appendSourceLinks(answer, citations);
  if (finalAnswer) await appendActionEvent(actionId, 'text_delta', { text: finalAnswer });
  await appendActionEvent(actionId, 'citations', { citations });
  await finishAction(actionId, 'completed', {
    resultMetadata: {
      toolWorkflowStatus: result.status,
      insufficientEvidence,
      citationCount: citations.length,
    },
    usageMetadata: retrievalUsage,
  });
  await nudgeAnswerDelivery(actionId);
}
