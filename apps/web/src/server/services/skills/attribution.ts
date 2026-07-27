import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';

/**
 * Which skills a turn loaded (028, FR-024).
 *
 * Deliberately derived from the `ai_tool_calls` chain rather than stored again.
 * Loading a skill IS a tool call, so the record already exists and is already
 * governed; a parallel table would be a second source of truth that could
 * disagree with the timeline the user actually saw.
 */

const SKILL_TOOLS = ['load_skill', 'read_skill_file'] as const;

function skillNameFrom(args: unknown): string | null {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  const name = (args as Record<string, unknown>).name;
  return typeof name === 'string' && name.length > 0 ? name : null;
}

/** Skill names loaded during one AI action, in first-loaded order. */
export async function skillsUsedByAction(actionId: string): Promise<string[]> {
  const rows = await db
    .select({ arguments: schema.aiToolCalls.arguments })
    .from(schema.aiToolCalls)
    .where(
      and(
        eq(schema.aiToolCalls.aiActionId, actionId),
        inArray(schema.aiToolCalls.toolName, [...SKILL_TOOLS]),
        // A denied or failed load did not influence the outcome, so it is not
        // attribution — it is just something the model tried.
        eq(schema.aiToolCalls.status, 'succeeded'),
      ),
    )
    .orderBy(schema.aiToolCalls.sequence);

  const names: string[] = [];
  for (const row of rows) {
    const name = skillNameFrom(row.arguments);
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** Skill names loaded during one tool workflow. Same derivation, narrower
 * scope, for review surfaces that hold a workflow rather than an action. */
export async function skillsUsedByWorkflow(workflowId: string): Promise<string[]> {
  const rows = await db
    .select({ arguments: schema.aiToolCalls.arguments })
    .from(schema.aiToolCalls)
    .where(
      and(
        eq(schema.aiToolCalls.workflowId, workflowId),
        inArray(schema.aiToolCalls.toolName, [...SKILL_TOOLS]),
        eq(schema.aiToolCalls.status, 'succeeded'),
      ),
    )
    .orderBy(schema.aiToolCalls.sequence);

  const names: string[] = [];
  for (const row of rows) {
    const name = skillNameFrom(row.arguments);
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}
