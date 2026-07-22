import { and, count, eq } from 'drizzle-orm';
import type { AiToolCallStatus, AiToolReviewDecision, AiToolWorkflowStatus } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';

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
