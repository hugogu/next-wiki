import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import {
  createWorkflow,
  getWorkflowByAction,
  transitionWorkflow,
} from '@/server/services/ai-tool-runtime';

/**
 * Worker entry point for a `wiki_tool_chat` action (026). Ensures the workflow
 * record exists and is running, then drives the bounded, permission-scoped tool
 * loop. `runAiAction` wraps this with start/finish and cancellation handling, so
 * this handler only owns the workflow lifecycle and (from US2) the tool calls.
 *
 * The bounded LLM tool-calling loop, provider-agnostic call envelope, event
 * emission, and mutation-to-draft/proposal wiring are added in US2/US3; until
 * then a turn simply opens and closes the workflow having made no tool calls.
 */
export async function runWikiToolChatAction(actionId: string): Promise<void> {
  const action = await db.query.aiActions.findFirst({
    where: eq(schema.aiActions.id, actionId),
    columns: { actorUserId: true },
  });
  if (!action) return;

  let workflow = (await getWorkflowByAction(actionId)) ?? null;
  if (!workflow) {
    workflow = await createWorkflow({
      aiActionId: actionId,
      actorUserId: action.actorUserId,
      maxCalls: 8,
    });
  }
  if (workflow.status === 'queued') {
    workflow = await transitionWorkflow(workflow.id, 'running');
  }

  // US2 inserts the bounded tool-calling loop between running and completion.

  if (workflow.status === 'running') {
    await transitionWorkflow(workflow.id, 'completed');
  }
}
