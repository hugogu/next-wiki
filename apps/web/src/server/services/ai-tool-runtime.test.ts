import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx, type PermCtx } from '@/server/permissions';
import {
  assertWorkflowTransition,
  buildCommandMarkdown,
  canTransitionCall,
  canTransitionWorkflow,
  createWorkflow,
  isTerminalWorkflowStatus,
  recordToolCall,
  runToolLoop,
  startToolCall,
  succeedToolCall,
  transitionWorkflow,
  type ToolPlanStep,
  type ToolPlanner,
} from '@/server/services/ai-tool-runtime';
import { getToolDefinition } from '@/server/services/ai-tool-registry';

async function seedToolChatAction(): Promise<string> {
  const [action] = await db
    .insert(schema.aiActions)
    .values({ feature: 'wiki_question', expiresAt: new Date(Date.now() + 3_600_000) })
    .returning({ id: schema.aiActions.id });
  return action!.id;
}

async function seedUserCtx(): Promise<{ userId: string; ctx: PermCtx }> {
  const [user] = await db
    .insert(schema.users)
    .values({ email: `loop-${crypto.randomUUID()}@example.com`, passwordHash: 'HASH', role: 'reader', status: 'active' })
    .returning({ id: schema.users.id });
  return { userId: user!.id, ctx: buildUserCtx(user!.id, 'reader') };
}

function scriptedPlanner(steps: ToolPlanStep[]): ToolPlanner {
  let index = 0;
  return async () => steps[index++] ?? { kind: 'final', text: 'done' };
}

const allowAll = () => true;
const noReview = () => 'none' as const;

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

describe('ai tool runtime — command markdown', () => {
  it('renders a bounded fenced tool-call record', () => {
    const md = buildCommandMarkdown('search_wiki', 'none', { query: 'payment routing' });
    expect(md).toContain('```tool-call');
    expect(md).toContain('tool: search_wiki');
    expect(md).toContain('review: none');
    expect(md).toContain('query: payment routing');
  });
});

describe('ai tool runtime — bounded loop', () => {
  let actionId: string;
  let ctx: PermCtx;

  beforeEach(async () => {
    actionId = await seedToolChatAction();
    ctx = (await seedUserCtx()).ctx;
  });

  async function loopWith(steps: ToolPlanStep[], maxCalls = 5, isCancelled?: () => Promise<boolean>) {
    const workflow = await createWorkflow({ aiActionId: actionId, actorUserId: null, maxCalls });
    await transitionWorkflow(workflow.id, 'running');
    const result = await runToolLoop({
      actionId,
      workflowId: workflow.id,
      ctx,
      actorUserId: null,
      question: 'find related pages',
      planner: scriptedPlanner(steps),
      resolveReview: noReview,
      isEnabled: allowAll,
      isCancelled,
    });
    return { workflow, result };
  }

  it('completes after a successful read tool call then a final answer', async () => {
    const { workflow, result } = await loopWith([
      { kind: 'tool_calls', calls: [{ toolName: 'search_wiki', arguments: { query: 'x' }, requestedReview: 'none' }] },
      { kind: 'final', text: 'Here is what I found.' },
    ]);
    expect(result.status).toBe('completed');
    expect(result.answer).toBe('Here is what I found.');
    expect(result.calls).toBe(1);
    const reloaded = await db.query.aiToolWorkflows.findFirst({ where: (w, { eq }) => eq(w.id, workflow.id) });
    expect(reloaded?.status).toBe('completed');
    const calls = await db.query.aiToolCalls.findMany({ where: (c, { eq }) => eq(c.workflowId, workflow.id) });
    expect(calls[0]?.status).toBe('succeeded');
  });

  it('records a failed tool call but still completes the turn', async () => {
    const { workflow, result } = await loopWith([
      {
        kind: 'tool_calls',
        calls: [{ toolName: 'get_page', arguments: { pageId: crypto.randomUUID() }, requestedReview: 'none' }],
      },
      { kind: 'final', text: 'Could not find it.' },
    ]);
    expect(result.status).toBe('completed');
    const calls = await db.query.aiToolCalls.findMany({ where: (c, { eq }) => eq(c.workflowId, workflow.id) });
    expect(calls[0]?.status).toBe('failed');
  });

  it('blocks a disabled tool without executing it', async () => {
    const workflow = await createWorkflow({ aiActionId: actionId, actorUserId: null, maxCalls: 5 });
    await transitionWorkflow(workflow.id, 'running');
    const result = await runToolLoop({
      actionId,
      workflowId: workflow.id,
      ctx,
      actorUserId: null,
      question: 'q',
      planner: scriptedPlanner([
        { kind: 'tool_calls', calls: [{ toolName: 'rename_tag', arguments: { tagId: crypto.randomUUID(), name: 'x' }, requestedReview: 'none' }] },
        { kind: 'final', text: 'done' },
      ]),
      resolveReview: noReview,
      isEnabled: (tool) => tool.name !== 'rename_tag',
    });
    expect(result.status).toBe('completed');
    const calls = await db.query.aiToolCalls.findMany({ where: (c, { eq }) => eq(c.workflowId, workflow.id) });
    expect(calls[0]?.status).toBe('blocked');
    expect(calls[0]?.errorCode).toBe('TOOL_NOT_ENABLED');
  });

  it('stops at limit_reached when the per-turn call limit is exceeded', async () => {
    const { result } = await loopWith(
      [
        { kind: 'tool_calls', calls: [{ toolName: 'search_wiki', arguments: { query: 'a' }, requestedReview: 'none' }] },
        { kind: 'tool_calls', calls: [{ toolName: 'search_wiki', arguments: { query: 'b' }, requestedReview: 'none' }] },
      ],
      1,
    );
    expect(result.status).toBe('limit_reached');
  });

  it('cancels immediately when cancellation is requested', async () => {
    const { result } = await loopWith(
      [{ kind: 'final', text: 'never reached' }],
      5,
      async () => true,
    );
    expect(result.status).toBe('cancelled');
  });

  it('keeps read tool definitions resolvable for the loop', () => {
    expect(getToolDefinition('search_wiki')?.category).toBe('read');
  });
});
