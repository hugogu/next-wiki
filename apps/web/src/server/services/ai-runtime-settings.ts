import { eq } from 'drizzle-orm';
import type { AiRuntimeSettingsUpdate, AiRuntimeSettingsView } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DEFAULT_ASSISTANT_SYSTEM_PROMPT } from '@/server/ai/prompts/wiki-question';
import { DEFAULT_TOOL_SYSTEM_PROMPT } from '@/server/jobs/wiki-question-tool-planner';

import { TOOL_PLANNER_MAX_OUTPUT_TOKENS_DEFAULT } from '@next-wiki/shared';

/**
 * Wiki AI runtime tuning (026). The planner parameters (max tool calls, sampling
 * temperature, max output tokens, timeout) and the two runtime prompts
 * (assistant system prompt, tool system prompt) live on the `ai_settings`
 * singleton so operators can tune the tool loop without a redeploy. Parameters
 * are edited from Bots > General; prompts from AI > Prompts. `null` prompts mean
 * "use the built-in default".
 */

const RUNTIME_DEFAULTS = {
  maxToolCalls: 100,
  plannerTemperature: 0.1,
  plannerMaxOutputTokens: TOOL_PLANNER_MAX_OUTPUT_TOKENS_DEFAULT,
  plannerTimeoutMs: 120_000,
};

export type AiRuntimeConfig = {
  maxToolCalls: number;
  /** Sampling temperature in [0, 2]. */
  plannerTemperature: number;
  plannerMaxOutputTokens: number;
  plannerTimeoutMs: number;
  /** Null means use the built-in default prompt. */
  assistantSystemPrompt: string | null;
  toolSystemPrompt: string | null;
};

/** Effective runtime config for the tool loop. No permission gate — internal. */
export async function resolveAiRuntimeConfig(): Promise<AiRuntimeConfig> {
  const row = await db.query.aiSettings.findFirst({ where: eq(schema.aiSettings.id, 'default') });
  return {
    maxToolCalls: row?.toolMaxCalls ?? RUNTIME_DEFAULTS.maxToolCalls,
    plannerTemperature: (row?.toolPlannerTemperature ?? 10) / 100,
    plannerMaxOutputTokens: row?.toolPlannerMaxOutputTokens ?? RUNTIME_DEFAULTS.plannerMaxOutputTokens,
    plannerTimeoutMs: row?.toolPlannerTimeoutMs ?? RUNTIME_DEFAULTS.plannerTimeoutMs,
    assistantSystemPrompt: row?.assistantSystemPrompt ?? null,
    toolSystemPrompt: row?.toolSystemPrompt ?? null,
  };
}

function assertRuntimeAdmin(ctx: PermCtx): void {
  if (!can(ctx, 'manage_ai', { kind: 'ai_settings' })) {
    throw new DomainError('FORBIDDEN', 'Admin access is required to manage AI runtime settings');
  }
}

export async function getAiRuntimeSettings(ctx: PermCtx): Promise<AiRuntimeSettingsView> {
  assertRuntimeAdmin(ctx);
  const config = await resolveAiRuntimeConfig();
  return {
    params: {
      toolMaxCalls: config.maxToolCalls,
      plannerTemperature: config.plannerTemperature,
      plannerMaxOutputTokens: config.plannerMaxOutputTokens,
      plannerTimeoutMs: config.plannerTimeoutMs,
    },
    prompts: {
      assistantSystemPrompt: config.assistantSystemPrompt,
      toolSystemPrompt: config.toolSystemPrompt,
    },
    defaults: {
      assistantSystemPrompt: DEFAULT_ASSISTANT_SYSTEM_PROMPT,
      toolSystemPrompt: DEFAULT_TOOL_SYSTEM_PROMPT,
    },
  };
}

/** Blank or whitespace-only prompt clears the override, restoring the default. */
function normalizePrompt(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value.trim() === '' ? null : value;
}

export async function updateAiRuntimeSettings(
  ctx: PermCtx,
  input: AiRuntimeSettingsUpdate,
): Promise<AiRuntimeSettingsView> {
  assertRuntimeAdmin(ctx);
  const patch: Partial<typeof schema.aiSettings.$inferInsert> = {
    updatedBy: getActorUserId(ctx),
    updatedAt: new Date(),
  };
  if (input.toolMaxCalls !== undefined) patch.toolMaxCalls = input.toolMaxCalls;
  if (input.plannerTemperature !== undefined) {
    patch.toolPlannerTemperature = Math.round(input.plannerTemperature * 100);
  }
  if (input.plannerMaxOutputTokens !== undefined) patch.toolPlannerMaxOutputTokens = input.plannerMaxOutputTokens;
  if (input.plannerTimeoutMs !== undefined) patch.toolPlannerTimeoutMs = input.plannerTimeoutMs;
  const assistant = normalizePrompt(input.assistantSystemPrompt);
  if (assistant !== undefined) patch.assistantSystemPrompt = assistant;
  const tool = normalizePrompt(input.toolSystemPrompt);
  if (tool !== undefined) patch.toolSystemPrompt = tool;

  await db
    .insert(schema.aiSettings)
    .values({ id: 'default', ...patch })
    .onConflictDoUpdate({ target: schema.aiSettings.id, set: patch });
  return getAiRuntimeSettings(ctx);
}
