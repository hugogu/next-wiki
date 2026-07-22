import { eq } from 'drizzle-orm';
import type { AiCitation, AiQuestionMode, AiToolReviewDecision } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { createAiProviderAdapter } from '@/server/ai/registry';
import { normalizeQuestionCitations } from '@/server/ai/prompts/wiki-question';
import { loadWikiQuestionSources } from '@/server/ai/retrieval/wiki-question-sources';
import { providerRuntime } from '@/server/services/ai-admin';
import { assertAiFeature } from '@/server/services/ai-entitlements';
import { appendActionEvent, finishAction, isCancellationRequested, readActionInput } from '@/server/services/ai-actions';
import {
  ensureBuiltinProvider,
  getPolicyRowsByProvider,
  policyLayersFor,
  resolveEffectiveReviewPolicy,
  resolveReviewDecision,
  resolveToolEnabled,
} from '@/server/services/ai-tool-policy';
import {
  hasExecutor,
} from '@/server/services/ai-tool-executors';
import {
  createWorkflow,
  getWorkflowByAction,
  runToolLoop,
  transitionWorkflow,
  type ToolPlanner,
} from '@/server/services/ai-tool-runtime';
import { listToolDefinitions, type ToolDefinition } from '@/server/services/ai-tool-registry';
import { nudgeAnswerDelivery } from '@/server/services/feishu-notifications';
import { getCitationHref } from '@/lib/path';
import { buildPlannerUserPrompt, parseToolPlan } from './ai-tool-chat-planner';

type ToolChatInput = {
  question: string;
  mode?: AiQuestionMode;
  requestedReview?: AiToolReviewDecision;
  currentPage?: { pageId: string; revisionId: string };
  conversation?: { question: string; answer: string }[];
};

const DEFAULT_MAX_CALLS = 100;
const PLANNER_MAX_OUTPUT_TOKENS = 1_200;

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
  ].join('\n');
}

export async function runWikiToolChatAction(actionId: string): Promise<void> {
  const input = await readActionInput<ToolChatInput>(actionId);
  const action = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
  if (!input || !action?.actorUserId || !action.modelId || !action.providerId) {
    throw new DomainError('CANCELLED', 'Tool chat input expired');
  }
  const [user, textModel] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, action.actorUserId) }),
    db.query.aiModels.findFirst({ where: eq(schema.aiModels.id, action.modelId) }),
  ]);
  if (!user || user.status !== 'active' || !textModel) {
    throw new DomainError('CANCELLED', 'Tool chat action is no longer authorized');
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
  const maxCalls = providerDefault?.maxCallsPerTurn ?? DEFAULT_MAX_CALLS;

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
    let output = '';
    for await (const event of adapter.streamText({
      actionId,
      modelExternalId: textModel.externalId,
      system,
      messages: [{ role: 'user', content: buildPlannerUserPrompt(state) }],
      maxOutputTokens: PLANNER_MAX_OUTPUT_TOKENS,
      temperature: 0.1,
      abortSignal: new AbortController().signal,
    })) {
      if (event.type === 'delta') output += event.text;
    }
    return parseToolPlan(output);
  };

  const result = await runToolLoop({
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

  if (result.status === 'cancelled') {
    throw new DomainError('CANCELLED', 'Tool chat was cancelled');
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
