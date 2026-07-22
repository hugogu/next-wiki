import { createHash } from 'node:crypto';
import { and, count, eq } from 'drizzle-orm';
import type {
  AiToolCallEventPayload,
  AiToolCallStatus,
  AiToolReviewDecision,
  AiToolWorkflowStatus,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import type { PermCtx } from '@/server/permissions';
import { appendToolCallEvent, appendToolProposalEvent } from '@/server/services/ai-actions';
import { auditToolCall } from '@/server/services/audit';
import { executeTool, resolveExecutableTool } from '@/server/services/ai-tool-executors';
import { getProposalRow } from '@/server/services/ai-tool-proposals';
import { BUILTIN_PROVIDER, type ToolDefinition } from '@/server/services/ai-tool-registry';

/**
 * Tool workflow + tool-call persistence primitives and state-transition guards
 * (026). One workflow record maps to one `wiki_tool_chat` AI action; tool calls
 * are its ordered children. The bounded LLM tool loop, provider-agnostic call
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

export function canTransitionWorkflow(from: AiToolWorkflowStatus, to: AiToolWorkflowStatus): boolean {
  return WORKFLOW_TRANSITIONS[from].includes(to);
}

export function canTransitionCall(from: AiToolCallStatus, to: AiToolCallStatus): boolean {
  return CALL_TRANSITIONS[from].includes(to);
}

export function assertWorkflowTransition(from: AiToolWorkflowStatus, to: AiToolWorkflowStatus): void {
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
  return db.query.aiToolWorkflows.findFirst({ where: eq(schema.aiToolWorkflows.aiActionId, actionId) });
}

/** Move a workflow to a new state, enforcing the legal transition set. */
export async function transitionWorkflow(id: string, to: AiToolWorkflowStatus): Promise<WorkflowRow> {
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
    .where(and(eq(schema.aiToolCalls.workflowId, workflowId), eq(schema.aiToolCalls.status, 'running')));
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
  transcript: string[];
};

export type ToolPlanner = (state: ToolTurnState) => Promise<ToolPlanStep>;

export type ToolLoopParams = {
  actionId: string;
  workflowId: string;
  ctx: PermCtx;
  actorUserId: string | null;
  question: string;
  conversation?: { question: string; answer: string }[];
  planner: ToolPlanner;
  /** Server-enforced review resolution for one call (strictest wins). */
  resolveReview: (tool: ToolDefinition, requested: AiToolReviewDecision) => AiToolReviewDecision;
  /** Effective enabled state for one tool (provider/category/tool policy). */
  isEnabled: (tool: ToolDefinition) => boolean;
  isCancelled?: () => Promise<boolean>;
};

export type ToolLoopResult = { status: AiToolWorkflowStatus; answer: string; calls: number };

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
  return ['```tool-call', `provider: ${BUILTIN_PROVIDER.key}`, `tool: ${toolName}`, `review: ${review}`, 'args:', argLines, '```']
    .filter((line) => line !== '')
    .join('\n');
}

function hashResult(data: unknown): string {
  return createHash('sha256').update(JSON.stringify(data ?? null)).digest('hex');
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
    transcript: [],
  };
  let answer = '';
  let calls = 0;

  for (;;) {
    if (params.isCancelled && (await params.isCancelled())) {
      await transitionWorkflow(params.workflowId, 'cancelled');
      return { status: 'cancelled', answer, calls };
    }

    const step = await params.planner(state);
    if (step.kind === 'final') {
      answer = step.text;
      await transitionWorkflow(params.workflowId, 'completed');
      return { status: 'completed', answer, calls };
    }

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
          await blockToolCall(call.id, {
            errorCode: 'TOOL_NOT_ENABLED',
            errorMessage: 'That tool is disabled by policy.',
          });
          await emitCall(params.actionId, call.id, {
            sequence: call.sequence,
            toolName: planned.toolName,
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

      const effectiveReview = params.resolveReview(tool, planned.requestedReview);
      const command = buildCommandMarkdown(planned.toolName, effectiveReview, planned.arguments);
      const { call, limitReached } = await recordToolCall({
        workflowId: params.workflowId,
        aiActionId: params.actionId,
        providerKey: BUILTIN_PROVIDER.key,
        toolName: planned.toolName,
        commandMarkdown: command,
        arguments: planned.arguments,
        requestedReview: planned.requestedReview,
        effectiveReview,
      });
      if (limitReached || !call) {
        await transitionWorkflow(params.workflowId, 'limit_reached');
        return { status: 'limit_reached', answer, calls };
      }
      calls += 1;

      await startToolCall(call.id);
      await emitCall(params.actionId, call.id, {
        sequence: call.sequence,
        toolName: tool.name,
        category: tool.category,
        command,
        status: 'running',
        requestedReview: planned.requestedReview,
        effectiveReview,
      });

      const result = await executeTool(params.ctx, tool, planned.arguments, {
        actorUserId: params.actorUserId,
        effectiveReview,
        workflowId: params.workflowId,
        toolCallId: call.id,
        actionId: params.actionId,
      });

      if (result.ok) {
        const resultHash = result.data !== undefined ? hashResult(result.data) : null;
        await succeedToolCall(call.id, { resultSummary: result.summary.slice(0, 500), resultHash });
        await auditToolCall(params.actorUserId, { toolName: tool.name, status: 'succeeded' });
        await emitCall(params.actionId, call.id, {
          sequence: call.sequence,
          toolName: tool.name,
          category: tool.category,
          command,
          status: 'succeeded',
          requestedReview: planned.requestedReview,
          effectiveReview,
          resultSummary: result.summary.slice(0, 500),
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
        state.transcript.push(`TOOL ${tool.name} -> ${JSON.stringify({ summary: result.summary, data: result.data })}`);
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
          category: tool.category,
          command,
          status: 'failed',
          requestedReview: planned.requestedReview,
          effectiveReview,
          errorCode: result.errorCode ?? 'TOOL_FAILED',
          errorMessage: result.errorMessage ?? result.summary,
        });
        state.transcript.push(`TOOL ${tool.name} -> failed: ${result.errorMessage ?? result.summary}`);
      }
    }
  }
}

async function emitCall(
  actionId: string,
  toolCallId: string,
  fields: Omit<AiToolCallEventPayload, 'toolCallId' | 'providerKey' | 'commandMarkdown'> & { command: string },
): Promise<void> {
  const { command, ...rest } = fields;
  await appendToolCallEvent(actionId, {
    toolCallId,
    providerKey: BUILTIN_PROVIDER.key,
    commandMarkdown: command,
    ...rest,
  });
}
