import { createHash } from 'node:crypto';
import { and, count, eq } from 'drizzle-orm';
import {
  isSkillToolName,
  TOOL_RESULT_MAX_CHARS_DEFAULT,
  type AiCitation,
  AiToolCallEventPayload,
  AiToolCallStatus,
  AiToolReviewDecision,
  AiToolWorkflowStatus,
  type ResearchMode,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import type { QuestionSource } from '@/server/ai/prompts/wiki-question';
import type { PermCtx } from '@/server/permissions';
import type { ScheduledAiJobScope } from '@next-wiki/shared';
import { appendToolCallEvent, appendToolProposalEvent } from '@/server/services/ai-actions';
import { auditToolCall } from '@/server/services/audit';
import {
  executeTool,
  pageContentWindowFor,
  resolveExecutableTool,
} from '@/server/services/ai-tool-executors';
import { getProposalRow } from '@/server/services/ai-tool-proposals';
import { BUILTIN_PROVIDER, type ToolDefinition } from '@/server/services/ai-tool-registry';
import { logger } from '@/server/logger';

/**
 * Tool workflow + tool-call persistence primitives and state-transition guards
 * (026). One workflow record maps to one tool-enabled `wiki_question` action;
 * tool calls are its ordered children. The bounded LLM tool loop, provider-agnostic call
 * envelope, cancellation handling, and safe assistant-facing failures are
 * layered on top in US2; page/proposal mutation wiring in US3. This module owns
 * only the durable records and the legal transitions between their states.
 */

export type WorkflowRow = typeof schema.aiToolWorkflows.$inferSelect;
export type ToolCallRow = typeof schema.aiToolCalls.$inferSelect;

// ---- Transition guards ------------------------------------------------------

const WORKFLOW_TRANSITIONS: Record<AiToolWorkflowStatus, AiToolWorkflowStatus[]> = {
  queued: ['running', 'cancelled'],
  running: ['waiting_review', 'completed', 'failed', 'cancelled', 'limit_reached'],
  waiting_review: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
  limit_reached: [],
};

const CALL_TRANSITIONS: Record<AiToolCallStatus, AiToolCallStatus[]> = {
  queued: ['running', 'blocked', 'cancelled'],
  running: ['succeeded', 'failed', 'blocked', 'cancelled'],
  succeeded: [],
  failed: [],
  blocked: [],
  cancelled: [],
};

export function canTransitionWorkflow(
  from: AiToolWorkflowStatus,
  to: AiToolWorkflowStatus,
): boolean {
  return WORKFLOW_TRANSITIONS[from].includes(to);
}

export function canTransitionCall(from: AiToolCallStatus, to: AiToolCallStatus): boolean {
  return CALL_TRANSITIONS[from].includes(to);
}

export function assertWorkflowTransition(
  from: AiToolWorkflowStatus,
  to: AiToolWorkflowStatus,
): void {
  if (!canTransitionWorkflow(from, to)) {
    throw new Error(`Illegal tool workflow transition: ${from} -> ${to}`);
  }
}

export function assertCallTransition(from: AiToolCallStatus, to: AiToolCallStatus): void {
  if (!canTransitionCall(from, to)) {
    throw new Error(`Illegal tool call transition: ${from} -> ${to}`);
  }
}

export function isTerminalWorkflowStatus(status: AiToolWorkflowStatus): boolean {
  return WORKFLOW_TRANSITIONS[status].length === 0;
}

// ---- Workflow persistence ---------------------------------------------------

export async function createWorkflow(input: {
  aiActionId: string;
  actorUserId: string | null;
  maxCalls: number;
}): Promise<WorkflowRow> {
  const [row] = await db
    .insert(schema.aiToolWorkflows)
    .values({
      aiActionId: input.aiActionId,
      actorUserId: input.actorUserId,
      maxCalls: input.maxCalls,
      status: 'queued',
    })
    .returning();
  return row!;
}

export async function getWorkflow(id: string): Promise<WorkflowRow | undefined> {
  return db.query.aiToolWorkflows.findFirst({ where: eq(schema.aiToolWorkflows.id, id) });
}

export async function getWorkflowByAction(actionId: string): Promise<WorkflowRow | undefined> {
  return db.query.aiToolWorkflows.findFirst({
    where: eq(schema.aiToolWorkflows.aiActionId, actionId),
  });
}

/** Move a workflow to a new state, enforcing the legal transition set. */
export async function transitionWorkflow(
  id: string,
  to: AiToolWorkflowStatus,
): Promise<WorkflowRow> {
  return db.transaction(async (tx) => {
    const current = await tx.query.aiToolWorkflows.findFirst({
      where: eq(schema.aiToolWorkflows.id, id),
    });
    if (!current) throw new Error(`Tool workflow ${id} not found`);
    if (current.status === to) return current;
    assertWorkflowTransition(current.status, to);
    const [row] = await tx
      .update(schema.aiToolWorkflows)
      .set({ status: to, ...(isTerminalWorkflowStatus(to) ? { finishedAt: new Date() } : {}) })
      .where(eq(schema.aiToolWorkflows.id, id))
      .returning();
    return row!;
  });
}

// ---- Tool-call persistence --------------------------------------------------

export async function nextCallSequence(workflowId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(schema.aiToolCalls)
    .where(eq(schema.aiToolCalls.workflowId, workflowId));
  return (row?.value ?? 0) + 1;
}

/**
 * Persist a queued tool call and atomically bump the workflow call counter.
 * Returns `{ call: null, limitReached: true }` when recording it would exceed
 * the workflow's per-turn limit, leaving the counter untouched.
 */
export async function recordToolCall(input: {
  workflowId: string;
  aiActionId: string;
  providerKey: string;
  toolName: string;
  commandMarkdown: string;
  arguments: Record<string, unknown>;
  requestedReview: AiToolReviewDecision;
  effectiveReview: AiToolReviewDecision;
}): Promise<{ call: ToolCallRow | null; limitReached: boolean }> {
  return db.transaction(async (tx) => {
    const workflow = await tx.query.aiToolWorkflows.findFirst({
      where: eq(schema.aiToolWorkflows.id, input.workflowId),
    });
    if (!workflow) throw new Error(`Tool workflow ${input.workflowId} not found`);
    if (workflow.callCount >= workflow.maxCalls) {
      return { call: null, limitReached: true };
    }
    const [seqRow] = await tx
      .select({ value: count() })
      .from(schema.aiToolCalls)
      .where(eq(schema.aiToolCalls.workflowId, input.workflowId));
    const sequence = (seqRow?.value ?? 0) + 1;
    const [call] = await tx
      .insert(schema.aiToolCalls)
      .values({
        workflowId: input.workflowId,
        aiActionId: input.aiActionId,
        providerKey: input.providerKey,
        toolName: input.toolName,
        sequence,
        commandMarkdown: input.commandMarkdown,
        arguments: input.arguments,
        status: 'queued',
        requestedReview: input.requestedReview,
        effectiveReview: input.effectiveReview,
      })
      .returning();
    await tx
      .update(schema.aiToolWorkflows)
      .set({ callCount: workflow.callCount + 1 })
      .where(eq(schema.aiToolWorkflows.id, input.workflowId));
    return { call: call!, limitReached: false };
  });
}

export async function getToolCall(id: string): Promise<ToolCallRow | undefined> {
  return db.query.aiToolCalls.findFirst({ where: eq(schema.aiToolCalls.id, id) });
}

async function transitionCall(
  id: string,
  to: AiToolCallStatus,
  patch: Partial<typeof schema.aiToolCalls.$inferInsert>,
): Promise<ToolCallRow> {
  return db.transaction(async (tx) => {
    const current = await tx.query.aiToolCalls.findFirst({ where: eq(schema.aiToolCalls.id, id) });
    if (!current) throw new Error(`Tool call ${id} not found`);
    assertCallTransition(current.status, to);
    const [row] = await tx
      .update(schema.aiToolCalls)
      .set({ status: to, ...patch })
      .where(eq(schema.aiToolCalls.id, id))
      .returning();
    return row!;
  });
}

export function startToolCall(id: string): Promise<ToolCallRow> {
  return transitionCall(id, 'running', { startedAt: new Date() });
}

export function succeedToolCall(
  id: string,
  result: { resultSummary?: string | null; resultHash?: string | null },
): Promise<ToolCallRow> {
  return transitionCall(id, 'succeeded', {
    resultSummary: result.resultSummary ?? null,
    resultHash: result.resultHash ?? null,
    finishedAt: new Date(),
  });
}

export function failToolCall(
  id: string,
  error: { errorCode: string; errorMessage: string },
): Promise<ToolCallRow> {
  return transitionCall(id, 'failed', {
    errorCode: error.errorCode,
    errorMessage: error.errorMessage.slice(0, 500),
    finishedAt: new Date(),
  });
}

/** Block a call the assistant requested that policy/permissions disallow. */
export function blockToolCall(
  id: string,
  reason: { errorCode: string; errorMessage: string },
): Promise<ToolCallRow> {
  return transitionCall(id, 'blocked', {
    errorCode: reason.errorCode,
    errorMessage: reason.errorMessage.slice(0, 500),
    finishedAt: new Date(),
  });
}

export function cancelToolCall(id: string): Promise<ToolCallRow> {
  return transitionCall(id, 'cancelled', { finishedAt: new Date() });
}

export async function listWorkflowCalls(workflowId: string): Promise<ToolCallRow[]> {
  return db
    .select()
    .from(schema.aiToolCalls)
    .where(eq(schema.aiToolCalls.workflowId, workflowId))
    .orderBy(schema.aiToolCalls.sequence);
}

export async function countRunningCalls(workflowId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(schema.aiToolCalls)
    .where(
      and(eq(schema.aiToolCalls.workflowId, workflowId), eq(schema.aiToolCalls.status, 'running')),
    );
  return row?.value ?? 0;
}

// ---- Bounded tool-calling loop (US2) ----------------------------------------

/** A tool the assistant asked to call, before server policy resolution. */
export type PlannedToolCall = {
  toolName: string;
  arguments: Record<string, unknown>;
  requestedReview: AiToolReviewDecision;
};

/** One planner decision: call more tools, or finish with an answer. */
export type ToolPlanStep =
  | { kind: 'tool_calls'; calls: PlannedToolCall[] }
  | { kind: 'final'; text: string };

/** State handed to the planner each iteration. `transcript` holds the safe,
 * bounded record of prior tool activity so a provider-agnostic planner can be
 * driven purely from text (no native function-calling required). */
export type ToolTurnState = {
  question: string;
  conversation: { question: string; answer: string }[];
  wikiSources: QuestionSource[];
  /** The page open when this chat turn was started. This is an exact,
   * permission-validated reference, not a retrieval result. */
  currentPage?: { pageId: string; revisionId: string };
  transcript: string[];
  researchMode?: ResearchMode;
};

export type ToolPlanner = (state: ToolTurnState) => Promise<ToolPlanStep>;

export type ToolLoopParams = {
  actionId: string;
  workflowId: string;
  ctx: PermCtx;
  actorUserId: string | null;
  question: string;
  conversation?: { question: string; answer: string }[];
  wikiSources?: QuestionSource[];
  currentPage?: { pageId: string; revisionId: string };
  researchMode?: ResearchMode;
  planner: ToolPlanner;
  /** Server-enforced review resolution for one call (strictest wins). */
  resolveReview: (tool: ToolDefinition, requested: AiToolReviewDecision) => AiToolReviewDecision;
  /** Effective enabled state for one tool (provider/category/tool policy). */
  isEnabled: (tool: ToolDefinition) => boolean;
  isCancelled?: () => Promise<boolean>;
  /** Characters of prior tool output the planner prompt may carry. Defaults to
   * {@link DEFAULT_TRANSCRIPT_CHARS}; callers that know the model's context
   * window should size it from that. */
  transcriptCharBudget?: number;
  /** Admin-configured characters of one tool result, clamped to the transcript
   * budget by {@link effectiveToolResultChars}. */
  toolResultMaxChars?: number;
  scheduledScope?: ScheduledAiJobScope;
  scheduledSkillNames?: string[];
  scheduledAiJobRunId?: string;
};

export type ToolLoopResult = {
  status: AiToolWorkflowStatus;
  answer: string;
  calls: number;
  citations: AiCitation[];
};

/** Bounded command record retained in Conversation history (tool-contract). */
export function buildCommandMarkdown(
  toolName: string,
  review: AiToolReviewDecision,
  args: Record<string, unknown>,
): string {
  const argLines = Object.entries(args)
    .map(([key, value]) => {
      const rendered = typeof value === 'string' ? value : JSON.stringify(value);
      const bounded = rendered.length > 200 ? `${rendered.slice(0, 197)}…` : rendered;
      return `  ${key}: ${bounded}`;
    })
    .join('\n');
  return [
    '```tool-call',
    `provider: ${BUILTIN_PROVIDER.key}`,
    `tool: ${toolName}`,
    `review: ${review}`,
    'args:',
    argLines,
    '```',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * One bounded rendering of a tool result for the model, shared by both
 * tool-call strategies (028, FR-006).
 *
 * Before this existed the whole `data` payload went verbatim into the next
 * prompt, so a single wide `list_pages` could crowd out the conversation it was
 * meant to inform. Truncation is marked in-band so the model can tell the
 * difference between "that is all there is" and "there was more".
 */
export const MAX_TOOL_RESULT_CHARS = TOOL_RESULT_MAX_CHARS_DEFAULT;

/**
 * Characters of prior tool output carried into the planner prompt.
 *
 * The transcript is re-sent in full on every iteration, so without a bound it
 * grows as `calls × the per-result cap` — at the default 100 calls and 32k
 * characters that is 3.2M characters, far past any context window. One
 * observed turn made 51 calls (40 of them the same `get_page`) and was sending
 * a prompt of roughly 350k characters by the end; the model stopped tracking
 * what it had read and rewrote a page from a fraction of it.
 *
 * The default is deliberately conservative because it must hold for the
 * smallest model an operator might assign. Callers that know the real context
 * window pass a budget derived from it.
 */
export const DEFAULT_TRANSCRIPT_CHARS = 48_000;

/**
 * Trim a tool transcript to its most recent `budget` characters.
 *
 * Recency wins: the planner needs the results of what it just did in order to
 * decide the next step, and an entry it dropped can be fetched again. The drop
 * is announced in-band for the same reason result truncation is — a model that
 * cannot tell "there was nothing more" from "I can no longer see it" will
 * confidently act on the gap.
 */
export function boundTranscript(transcript: string[], budget = DEFAULT_TRANSCRIPT_CHARS): string[] {
  const kept: string[] = [];
  let total = 0;
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const entry = transcript[index]!;
    if (kept.length === 0) {
      kept.unshift(entry);
      total += entry.length;
      // Keep the latest result even when it alone exceeds the budget. This is
      // only possible for callers that bypass the effective per-result cap.
      if (total > budget) return kept;
      continue;
    }
    if (total + entry.length <= budget) {
      kept.unshift(entry);
      total += entry.length;
      continue;
    }

    let omitted = index + 1;
    let notice = omissionNotice(omitted, budget);
    while (kept.length > 0 && total + notice.length > budget) {
      total -= kept.shift()!.length;
      omitted += 1;
      notice = omissionNotice(omitted, budget);
    }
    return kept.length > 0 ? [notice, ...kept] : [notice.slice(0, budget)];
  }
  return kept;
}

function omissionNotice(omitted: number, budget: number): string {
  return `[${omitted} earlier tool result(s) omitted: the transcript exceeded ${budget} characters. Call the tool again if you need one of them; do not assume what it said.]`;
}

/**
 * Effective per-result cap for one turn.
 *
 * Clamped to the transcript budget because the transcript is what the prompt
 * actually carries: a configured cap larger than the budget would produce a
 * single result the loop must either drop whole or send over the window. The
 * admin dial therefore cannot be set into failure on a small-context model —
 * it just stops growing.
 */
export function effectiveToolResultChars(
  configured: number = MAX_TOOL_RESULT_CHARS,
  transcriptBudget: number = DEFAULT_TRANSCRIPT_CHARS,
): number {
  return Math.max(1_000, Math.min(configured, transcriptBudget));
}

export function formatToolResultForModel(
  toolName: string,
  result: { summary: string; data?: unknown },
  maxChars: number = MAX_TOOL_RESULT_CHARS,
): { text: string; truncated: boolean } {
  const rendered = formatToolResultPayload(toolName, result);
  if (rendered.length <= maxChars) {
    return { text: `TOOL ${toolName} -> ${rendered}`, truncated: false };
  }
  const kept = rendered.slice(0, maxChars);
  return {
    text: `TOOL ${toolName} -> ${kept}\n[truncated: the result exceeded ${maxChars} characters. Read the omitted part with the tool's own paging argument (contentOffset) or narrow the query — do not rely on what is missing.]`,
    truncated: true,
  };
}

/**
 * Page Markdown is sent back to the model as a verbatim block, not as a JSON
 * string. JSON correctly represents a single backslash as `\\`, but models
 * commonly copy that representation into a YAML literal block, where it is
 * not unescaped before save_draft persists it. That turns `\circ` into
 * `\\circ` and breaks KaTeX.
 */
function formatToolResultPayload(
  toolName: string,
  result: { summary: string; data?: unknown },
): string {
  const data = result.data;
  if (
    toolName === 'get_page' &&
    data !== null &&
    typeof data === 'object' &&
    typeof (data as { contentSource?: unknown }).contentSource === 'string'
  ) {
    const { contentSource, ...metadata } = data as { contentSource: string } & Record<
      string,
      unknown
    >;
    return `${JSON.stringify({
      summary: result.summary,
      data: { ...metadata, contentSource: 'verbatim page source follows' },
    })}\n<page_source>\n${contentSource}\n</page_source>`;
  }
  if (
    toolName === 'web_open' &&
    data !== null &&
    typeof data === 'object' &&
    typeof (data as { source?: { content?: unknown } }).source?.content === 'string'
  ) {
    const { content, ...source } = (data as { source: { content: string } & Record<string, unknown> }).source;
    return `${JSON.stringify({
      summary: result.summary,
      data: {
        source: {
          ...source,
          content: 'untrusted external source content follows',
        },
      },
    })}\n<untrusted_external_source>\n${content}\n</untrusted_external_source>`;
  }
  return JSON.stringify({ summary: result.summary, data });
}

/**
 * Identity of a tool call within one turn, insensitive to argument key order
 * (models do not emit a stable order across iterations).
 */
export function toolCallSignature(toolName: string, args: Record<string, unknown>): string {
  return `${toolName}:${stableStringify(args)}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
}

/**
 * Consecutive planner steps that may consist purely of repeated calls before
 * the turn is ended without an answer.
 *
 * The prompt already asks the model not to repeat equivalent searches, and a
 * prompt is the only thing that ever asked. One observed turn called
 * `search_wiki` 79 times over six and a half minutes — 30 of them byte-identical
 * — because the tool kept returning one page that was not the page it was
 * looking for. Two directives are a fair warning; a third identical step is a
 * loop, not a plan.
 */
export const DUPLICATE_ONLY_STEP_LIMIT = 3;

const REPEATED_CALL_NOTICE =
  '[repeated call: this tool already ran with identical arguments in this turn, so the server did not run it again. Its earlier result follows unchanged. If it does not answer the question, change the arguments or answer from what you already have.]';

function repeatedStepDirective(remainingSteps: number): string {
  return `[every tool call in your last step repeated an earlier one with identical arguments, so nothing new was read. Change your approach or write the final answer now — after ${remainingSteps} more such step(s) this turn ends without one.]`;
}

function hashResult(data: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(data ?? null))
    .digest('hex');
}

function citationFromCandidate(value: unknown): AiCitation | null {
  const candidate = value as Record<string, unknown> | null;
  if (!candidate) return null;
  const pageId = typeof candidate.pageId === 'string' ? candidate.pageId : null;
  const title = typeof candidate.title === 'string' ? candidate.title : null;
  const path = typeof candidate.path === 'string' ? candidate.path : null;
  const locale = typeof candidate.locale === 'string' ? candidate.locale : 'en';
  const revisionId = typeof candidate.revisionId === 'string' ? candidate.revisionId : null;
  const revisionHash = typeof candidate.revisionHash === 'string' ? candidate.revisionHash : null;
  if (!pageId || !title || !path || !revisionId || !revisionHash) return null;
  return {
    kind: 'wiki',
    pageId,
    title,
    path,
    locale,
    revisionId,
    revisionHash,
    ...(typeof candidate.spaceSlug === 'string' ? { spaceSlug: candidate.spaceSlug } : {}),
  };
}

export function collectToolCitations(toolName: string, data: unknown): AiCitation[] {
  // Search/list results are discovery candidates, not evidence that the model
  // actually read. Including every candidate made the final Sources list noisy
  // and implied support that was never inspected. get_page is the content-
  // bearing read tool; baseline RAG citations are handled separately.
  if (toolName === 'web_open') {
    const source = (data as { source?: Record<string, unknown> } | null)?.source;
    if (!source) return [];
    const sourceId = typeof source.sourceId === 'string' ? source.sourceId : null;
    const title = typeof source.title === 'string' ? source.title : null;
    const canonicalUrl = typeof source.canonicalUrl === 'string' ? source.canonicalUrl : null;
    const provider = typeof source.provider === 'string' ? source.provider : null;
    const retrievedAt = typeof source.retrievedAt === 'string' ? source.retrievedAt : null;
    if (!sourceId || !title || !canonicalUrl || !provider || !retrievedAt) return [];
    return [{
      kind: 'web',
      sourceId,
      title,
      canonicalUrl,
      provider,
      retrievedAt,
      ...(typeof source.contentHash === 'string' ? { contentHash: source.contentHash } : {}),
    }];
  }
  if (toolName !== 'get_page') return [];
  const root = data as { items?: unknown[] } | null;
  const values = Array.isArray(root?.items) ? root.items : [data];
  return values
    .map((value) => citationFromCandidate(value))
    .filter((citation): citation is AiCitation => Boolean(citation));
}

/**
 * Drive the bounded, permission-scoped tool loop for one chat turn. The planner
 * (injected: the real one wraps the model, tests script it) proposes tool calls
 * or a final answer; the server resolves each call's review disposition, records
 * it, executes it under the initiating user's `PermCtx`, streams lifecycle
 * events, and threads a safe result summary back for the next planner step.
 *
 * Terminates on the planner's final answer, the per-turn call limit, or
 * cancellation — mapping each to the matching workflow terminal state.
 */
export async function runToolLoop(params: ToolLoopParams): Promise<ToolLoopResult> {
  const state: ToolTurnState = {
    question: params.question,
    conversation: params.conversation ?? [],
    wikiSources: params.wikiSources ?? [],
    currentPage: params.currentPage,
    transcript: [],
    researchMode: params.researchMode,
  };
  const transcriptBudget = params.transcriptCharBudget ?? DEFAULT_TRANSCRIPT_CHARS;
  const resultMaxChars = effectiveToolResultChars(params.toolResultMaxChars, transcriptBudget);
  let answer = '';
  let calls = 0;
  const citations = new Map<string, AiCitation>();
  const loopStartedAt = Date.now();
  let iterations = 0;
  // Read and action-scoped web tools are idempotent within a turn, so an
  // identical repeat can only return what the cache already holds. Replaying it costs the model a step
  // instead of a database round trip, an audit row, and a slot in the call
  // budget — and makes the repetition visible to it in-band.
  const readResults = new Map<string, string>();
  let duplicateOnlySteps = 0;

  logger.info('tool loop started', {
    actionId: params.actionId,
    workflowId: params.workflowId,
    actorUserId: params.actorUserId,
    questionBytes: Buffer.byteLength(params.question),
    conversationTurns: (params.conversation ?? []).length,
    wikiSourceCount: (params.wikiSources ?? []).length,
  });

  for (;;) {
    iterations += 1;
    if (params.isCancelled && (await params.isCancelled())) {
      logger.info('tool loop cancelled', {
        actionId: params.actionId,
        workflowId: params.workflowId,
        iterations,
        calls,
        durationMs: Date.now() - loopStartedAt,
      });
      await transitionWorkflow(params.workflowId, 'cancelled');
      return { status: 'cancelled', answer, calls, citations: [...citations.values()] };
    }

    // Bound immediately before planning rather than on push: the loop keeps
    // appending, and what matters is the size of the prompt actually sent.
    state.transcript = boundTranscript(state.transcript, transcriptBudget);
    const step = await params.planner(state);
    logger.info('tool loop planner step', {
      actionId: params.actionId,
      workflowId: params.workflowId,
      iteration: iterations,
      kind: step.kind,
      plannedCallCount: step.kind === 'tool_calls' ? step.calls.length : 0,
    });
    if (step.kind === 'final') {
      answer = step.text;
      logger.info('tool loop completed', {
        actionId: params.actionId,
        workflowId: params.workflowId,
        iterations,
        calls,
        citations: citations.size,
        answerBytes: Buffer.byteLength(answer),
        durationMs: Date.now() - loopStartedAt,
      });
      await transitionWorkflow(params.workflowId, 'completed');
      return { status: 'completed', answer, calls, citations: [...citations.values()] };
    }

    let repeatedCalls = 0;
    for (const planned of step.calls) {
      const tool = resolveExecutableTool(planned.toolName);
      if (!tool || !params.isEnabled(tool)) {
        // Record a blocked call so the disabled/unknown tool is visible and the
        // assistant gets a safe explanation instead of a silent no-op.
        const command = buildCommandMarkdown(planned.toolName, 'none', planned.arguments);
        const { call } = await recordToolCall({
          workflowId: params.workflowId,
          aiActionId: params.actionId,
          providerKey: BUILTIN_PROVIDER.key,
          toolName: planned.toolName,
          commandMarkdown: command,
          arguments: planned.arguments,
          requestedReview: planned.requestedReview,
          effectiveReview: 'none',
        });
        if (call) {
          calls += 1;
          logger.warn('tool call blocked by policy', {
            actionId: params.actionId,
            workflowId: params.workflowId,
            toolCallId: call.id,
            toolName: planned.toolName,
            reason: !tool ? 'tool-not-registered' : 'tool-disabled',
            requestedReview: planned.requestedReview,
            argumentKeys: Object.keys(planned.arguments),
          });
          await blockToolCall(call.id, {
            errorCode: 'TOOL_NOT_ENABLED',
            errorMessage: 'That tool is disabled by policy.',
          });
          await emitCall(params.actionId, call.id, {
            sequence: call.sequence,
            toolName: planned.toolName,
            skillName: skillNameOf(planned.toolName, planned.arguments),
            command,
            status: 'blocked',
            requestedReview: planned.requestedReview,
            effectiveReview: 'none',
            errorCode: 'TOOL_NOT_ENABLED',
            errorMessage: 'That tool is disabled by policy.',
          });
        }
        state.transcript.push(`TOOL ${planned.toolName} -> blocked: disabled by policy`);
        continue;
      }

      const signature = toolCallSignature(tool.name, planned.arguments);
      const cached = tool.category === 'read' || tool.category === 'web' ? readResults.get(signature) : undefined;
      if (cached !== undefined) {
        repeatedCalls += 1;
        logger.warn('tool call repeated with identical arguments', {
          actionId: params.actionId,
          workflowId: params.workflowId,
          iteration: iterations,
          toolName: tool.name,
          argumentKeys: Object.keys(planned.arguments),
        });
        state.transcript.push(`${REPEATED_CALL_NOTICE}\n${cached}`);
        continue;
      }

      const effectiveReview = params.resolveReview(tool, planned.requestedReview);
      const command = buildCommandMarkdown(planned.toolName, effectiveReview, planned.arguments);
      const { call, limitReached } = await recordToolCall({
        workflowId: params.workflowId,
        aiActionId: params.actionId,
        providerKey: BUILTIN_PROVIDER.key,
        toolName: tool.name,
        commandMarkdown: command,
        arguments: planned.arguments,
        requestedReview: planned.requestedReview,
        effectiveReview,
      });
      if (limitReached || !call) {
        logger.warn('tool loop hit per-turn call limit', {
          actionId: params.actionId,
          workflowId: params.workflowId,
          iterations,
          calls,
          limitReached,
          toolName: tool.name,
        });
        await transitionWorkflow(params.workflowId, 'limit_reached');
        return { status: 'limit_reached', answer, calls, citations: [...citations.values()] };
      }
      calls += 1;

      await startToolCall(call.id);
      await emitCall(params.actionId, call.id, {
        sequence: call.sequence,
        toolName: tool.name,
        skillName: skillNameOf(tool.name, planned.arguments),
        category: tool.category,
        command,
        status: 'running',
        requestedReview: planned.requestedReview,
        effectiveReview,
      });

      const toolStartedAt = Date.now();
      const result = await executeTool(params.ctx, tool, planned.arguments, {
        actorUserId: params.actorUserId,
        effectiveReview,
        workflowId: params.workflowId,
        toolCallId: call.id,
        actionId: params.actionId,
        originalQuestion: params.question,
        conversation: state.conversation,
        contentWindowChars: pageContentWindowFor(resultMaxChars),
        scheduledScope: params.scheduledScope,
        scheduledSkillNames: params.scheduledSkillNames,
        scheduledAiJobRunId: params.scheduledAiJobRunId,
      });
      const toolDurationMs = Date.now() - toolStartedAt;

      if (result.ok) {
        for (const citation of collectToolCitations(tool.name, result.data)) {
          citations.set(
            citation.kind === 'web'
              ? `${citation.sourceId}:${citation.contentHash ?? citation.retrievedAt}`
              : `${citation.pageId}:${citation.revisionId}`,
            citation,
          );
        }
        const resultHash = result.data !== undefined ? hashResult(result.data) : null;
        const rendered = formatToolResultForModel(tool.name, result, resultMaxChars);
        // Truncation is part of the durable record, not just a prompt detail:
        // an answer built on a truncated result should be explicable later.
        const storedSummary = rendered.truncated
          ? `${result.summary.slice(0, 480)} (result truncated)`
          : result.summary.slice(0, 500);
        await succeedToolCall(call.id, { resultSummary: storedSummary, resultHash });
        await auditToolCall(params.actorUserId, { toolName: tool.name, status: 'succeeded' });
        await emitCall(params.actionId, call.id, {
          sequence: call.sequence,
          toolName: tool.name,
          skillName: skillNameOf(tool.name, planned.arguments),
          category: tool.category,
          command,
          status: 'succeeded',
          requestedReview: planned.requestedReview,
          effectiveReview,
          resultSummary: storedSummary,
          proposalId: result.proposalId ?? null,
          evidencePageId: result.evidencePageId ?? null,
        });
        if (result.proposalId) {
          const proposal = await getProposalRow(result.proposalId);
          if (proposal) {
            await appendToolProposalEvent(params.actionId, {
              proposalId: proposal.id,
              kind: proposal.kind,
              status: proposal.status,
              title: proposal.title,
              url: `/admin/ai/tools/proposals/${proposal.id}`,
            });
          }
        }
        logger.info('tool call succeeded', {
          actionId: params.actionId,
          workflowId: params.workflowId,
          toolCallId: call.id,
          toolName: tool.name,
          category: tool.category,
          sequence: call.sequence,
          effectiveReview,
          citations: collectToolCitations(tool.name, result.data).length,
          summaryBytes: result.summary.length,
          resultTruncated: rendered.truncated,
          durationMs: toolDurationMs,
        });
        state.transcript.push(rendered.text);
        // Only successes: a read that failed may well succeed on a retry, so
        // replaying its error would strand the model on a transient fault.
        if (tool.category === 'read' || tool.category === 'web') readResults.set(signature, rendered.text);
      } else {
        await failToolCall(call.id, {
          errorCode: result.errorCode ?? 'TOOL_FAILED',
          errorMessage: result.errorMessage ?? result.summary,
        });
        await auditToolCall(params.actorUserId, {
          toolName: tool.name,
          status: 'failed',
          errorCode: result.errorCode,
        });
        await emitCall(params.actionId, call.id, {
          sequence: call.sequence,
          toolName: tool.name,
          skillName: skillNameOf(tool.name, planned.arguments),
          category: tool.category,
          command,
          status: 'failed',
          requestedReview: planned.requestedReview,
          effectiveReview,
          errorCode: result.errorCode ?? 'TOOL_FAILED',
          errorMessage: result.errorMessage ?? result.summary,
          errorDetail: result.errorDetail ?? null,
        });
        logger.warn('tool call failed', {
          actionId: params.actionId,
          workflowId: params.workflowId,
          toolCallId: call.id,
          toolName: tool.name,
          category: tool.category,
          sequence: call.sequence,
          effectiveReview,
          errorCode: result.errorCode ?? 'TOOL_FAILED',
          errorMessage: result.errorMessage ?? result.summary,
          durationMs: toolDurationMs,
        });
        state.transcript.push(
          `TOOL ${tool.name} -> failed: ${result.errorMessage ?? result.summary}`,
        );
      }
    }

    // A step that read nothing new cannot have moved the turn forward. Warn
    // in-band first — a model given the repetition explicitly usually changes
    // course — and end the turn rather than let it spin against the call budget.
    if (step.calls.length > 0 && repeatedCalls === step.calls.length) {
      duplicateOnlySteps += 1;
      if (duplicateOnlySteps >= DUPLICATE_ONLY_STEP_LIMIT) {
        logger.warn('tool loop stopped on repeated tool calls', {
          actionId: params.actionId,
          workflowId: params.workflowId,
          iterations,
          calls,
          duplicateOnlySteps,
        });
        await transitionWorkflow(params.workflowId, 'limit_reached');
        return { status: 'limit_reached', answer, calls, citations: [...citations.values()] };
      }
      state.transcript.push(repeatedStepDirective(DUPLICATE_ONLY_STEP_LIMIT - duplicateOnlySteps));
    } else {
      duplicateOnlySteps = 0;
    }
  }
}

async function emitCall(
  actionId: string,
  toolCallId: string,
  fields: Omit<AiToolCallEventPayload, 'toolCallId' | 'providerKey' | 'commandMarkdown'> & {
    command: string;
  },
): Promise<void> {
  const { command, ...rest } = fields;
  await appendToolCallEvent(actionId, {
    toolCallId,
    providerKey: BUILTIN_PROVIDER.key,
    commandMarkdown: command,
    ...rest,
  });
}

/**
 * The skill a call is about, when it is about one (028).
 *
 * Read from the arguments the runtime already holds rather than parsed back out
 * of the command record, so the chat can say "Skill: wiki-linker" instead of
 * showing a bare `load_skill` that a reader has to decode.
 */
function skillNameOf(toolName: string, args: Record<string, unknown>): string | null {
  if (!isSkillToolName(toolName)) return null;
  return typeof args.name === 'string' && args.name.length > 0 ? args.name : null;
}
