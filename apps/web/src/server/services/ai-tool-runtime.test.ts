import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import {
  assertWorkflowTransition,
  canTransitionCall,
  canTransitionWorkflow,
  createWorkflow,
  isTerminalWorkflowStatus,
  recordToolCall,
  startToolCall,
  succeedToolCall,
  transitionWorkflow,
} from '@/server/services/ai-tool-runtime';

async function seedToolChatAction(): Promise<string> {
  const [action] = await db
    .insert(schema.aiActions)
    .values({ feature: 'wiki_tool_chat', expiresAt: new Date(Date.now() + 3_600_000) })
    .returning({ id: schema.aiActions.id });
  return action!.id;
}

describe('ai tool runtime — transition guards', () => {
  it('permits the documented workflow transitions and rejects others', () => {
    expect(canTransitionWorkflow('queued', 'running')).toBe(true);
    expect(canTransitionWorkflow('running', 'limit_reached')).toBe(true);
    expect(canTransitionWorkflow('waiting_review', 'completed')).toBe(true);
    expect(canTransitionWorkflow('completed', 'running')).toBe(false);
    expect(canTransitionWorkflow('queued', 'completed')).toBe(false);
    expect(isTerminalWorkflowStatus('completed')).toBe(true);
    expect(isTerminalWorkflowStatus('running')).toBe(false);
    expect(() => assertWorkflowTransition('completed', 'running')).toThrow();
  });

  it('permits the documented tool-call transitions and rejects others', () => {
    expect(canTransitionCall('queued', 'running')).toBe(true);
    expect(canTransitionCall('queued', 'blocked')).toBe(true);
    expect(canTransitionCall('running', 'succeeded')).toBe(true);
    expect(canTransitionCall('succeeded', 'running')).toBe(false);
    expect(canTransitionCall('blocked', 'succeeded')).toBe(false);
  });
});

describe('ai tool runtime — persistence', () => {
  let actionId: string;

  beforeEach(async () => {
    actionId = await seedToolChatAction();
  });

  it('creates a workflow and records ordered tool calls, bumping the counter', async () => {
    const workflow = await createWorkflow({ aiActionId: actionId, actorUserId: null, maxCalls: 3 });
    expect(workflow.status).toBe('queued');

    const first = await recordToolCall({
      workflowId: workflow.id,
      aiActionId: actionId,
      providerKey: 'next-wiki',
      toolName: 'search_wiki',
      commandMarkdown: '```tool-call\nsearch_wiki\n```',
      arguments: { q: 'payment' },
      requestedReview: 'none',
      effectiveReview: 'none',
    });
    const second = await recordToolCall({
      workflowId: workflow.id,
      aiActionId: actionId,
      providerKey: 'next-wiki',
      toolName: 'get_page',
      commandMarkdown: '```tool-call\nget_page\n```',
      arguments: {},
      requestedReview: 'none',
      effectiveReview: 'none',
    });
    expect(first.call?.sequence).toBe(1);
    expect(second.call?.sequence).toBe(2);
    const reloaded = await db.query.aiToolWorkflows.findFirst({
      where: (w, { eq }) => eq(w.id, workflow.id),
    });
    expect(reloaded?.callCount).toBe(2);
  });

  it('reports limit_reached without recording once the per-turn limit is hit', async () => {
    const workflow = await createWorkflow({ aiActionId: actionId, actorUserId: null, maxCalls: 1 });
    const ok = await recordToolCall({
      workflowId: workflow.id,
      aiActionId: actionId,
      providerKey: 'next-wiki',
      toolName: 'search_wiki',
      commandMarkdown: 'x',
      arguments: {},
      requestedReview: 'none',
      effectiveReview: 'none',
    });
    const overflow = await recordToolCall({
      workflowId: workflow.id,
      aiActionId: actionId,
      providerKey: 'next-wiki',
      toolName: 'get_page',
      commandMarkdown: 'y',
      arguments: {},
      requestedReview: 'none',
      effectiveReview: 'none',
    });
    expect(ok.limitReached).toBe(false);
    expect(overflow.limitReached).toBe(true);
    expect(overflow.call).toBeNull();
  });

  it('drives a call through running -> succeeded and rejects illegal workflow moves', async () => {
    const workflow = await createWorkflow({ aiActionId: actionId, actorUserId: null, maxCalls: 5 });
    const { call } = await recordToolCall({
      workflowId: workflow.id,
      aiActionId: actionId,
      providerKey: 'next-wiki',
      toolName: 'search_wiki',
      commandMarkdown: 'x',
      arguments: {},
      requestedReview: 'none',
      effectiveReview: 'none',
    });
    const running = await startToolCall(call!.id);
    expect(running.status).toBe('running');
    const done = await succeedToolCall(call!.id, { resultSummary: '3 pages matched' });
    expect(done.status).toBe('succeeded');
    expect(done.resultSummary).toBe('3 pages matched');

    await transitionWorkflow(workflow.id, 'running');
    await transitionWorkflow(workflow.id, 'completed');
    await expect(transitionWorkflow(workflow.id, 'running')).rejects.toThrow();
  });
});
