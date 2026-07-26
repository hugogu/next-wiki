import { eq } from 'drizzle-orm';
import type { ResolvedToolCallStrategy, ToolCallStrategy } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { logger } from '@/server/logger';

/**
 * Which tool-call strategy a model uses (028, FR-002/FR-003).
 *
 * This is deliberately separate from the `tool_calling` capability. That
 * capability answers *whether* a model may drive the governed tool loop at all;
 * this answers *how* the calls reach it. Conflating them would make an admin
 * override of `tool_calling = false` mean "no tools" and "text protocol" at the
 * same time, and there would be no way to say the second without the first.
 *
 * Resolution never fails the user's turn: every branch produces a usable
 * strategy, and the text protocol is always available as the floor.
 */

export type ToolStrategyInput = {
  /** Administrator override stored on the model. */
  strategy: ToolCallStrategy;
  /** Set when a native tool payload was rejected at runtime. */
  nativeFailedAt: Date | null;
  /** Whether the adapter can express tools in the provider's own protocol. */
  adapterSupportsNativeTools: boolean;
};

export type ToolStrategyResolution = {
  strategy: ResolvedToolCallStrategy;
  /** Why, for logging and the admin surface. */
  reason:
    | 'admin_override_native'
    | 'admin_override_text'
    | 'adapter_unsupported'
    | 'previous_native_failure'
    | 'auto_native';
};

/** Pure resolution, so every branch is testable without a database. */
export function resolveToolCallStrategy(input: ToolStrategyInput): ToolStrategyResolution {
  if (input.strategy === 'text') return { strategy: 'text', reason: 'admin_override_text' };
  if (input.strategy === 'native') {
    // An explicit `native` override still cannot invent a capability the
    // adapter does not have; falling back keeps the turn working, and the
    // reason makes the mismatch visible rather than silent.
    if (!input.adapterSupportsNativeTools) {
      return { strategy: 'text', reason: 'adapter_unsupported' };
    }
    return { strategy: 'native', reason: 'admin_override_native' };
  }
  if (!input.adapterSupportsNativeTools) {
    return { strategy: 'text', reason: 'adapter_unsupported' };
  }
  if (input.nativeFailedAt) {
    return { strategy: 'text', reason: 'previous_native_failure' };
  }
  return { strategy: 'native', reason: 'auto_native' };
}

/**
 * Record that a model rejected the native tool payload, so the next turn goes
 * straight to the text protocol instead of paying for another failed attempt.
 * Best-effort: a failure to persist must not fail the user's turn, which is
 * already being retried with the text planner.
 */
export async function markNativeToolCallFailed(modelId: string): Promise<void> {
  try {
    await db
      .update(schema.aiModels)
      .set({ nativeToolCallFailedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.aiModels.id, modelId));
    logger.warn('model downgraded to the text tool protocol', { modelId });
  } catch (error) {
    logger.warn('failed to record native tool-call downgrade', {
      modelId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Clear the runtime downgrade. Called when an Administrator changes the
 * strategy or the model is re-synced, so a provider fixing its tool support is
 * one action away from being usable natively again.
 */
export async function clearNativeToolCallFailure(modelId: string): Promise<void> {
  await db
    .update(schema.aiModels)
    .set({ nativeToolCallFailedAt: null, updatedAt: new Date() })
    .where(eq(schema.aiModels.id, modelId));
}

export async function setToolCallStrategy(
  modelId: string,
  strategy: ToolCallStrategy,
): Promise<void> {
  await db
    .update(schema.aiModels)
    .set({ toolCallStrategy: strategy, nativeToolCallFailedAt: null, updatedAt: new Date() })
    .where(eq(schema.aiModels.id, modelId));
}
