import { eq } from 'drizzle-orm';
import type { AiActionFeature } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import {
  assertAiEnabled,
  finishAction,
  isCancellationRequested,
  startAction,
} from '@/server/services/ai-actions';
import { AiProviderError, normalizeProviderError } from '@/server/ai/types';
import { DomainError } from '@/server/errors';

export type AiActionHandler = (actionId: string) => Promise<void>;

const handlers = new Map<AiActionFeature, AiActionHandler>();

export function registerAiActionHandler(feature: AiActionFeature, handler: AiActionHandler): void {
  handlers.set(feature, handler);
}

export async function runAiAction(actionId: string): Promise<void> {
  const action = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
  if (!action || !['queued', 'running'].includes(action.status)) return;
  if (await isCancellationRequested(actionId)) {
    await finishAction(actionId, 'cancelled', { errorCode: 'CANCELLED', errorMessage: 'AI action was cancelled' });
    return;
  }
  try {
    await assertAiEnabled();
    if (action.actorUserId) {
      const user = await db.query.users.findFirst({ where: eq(schema.users.id, action.actorUserId) });
      if (!user || user.status !== 'active') {
        await finishAction(actionId, 'cancelled', {
          errorCode: 'CANCELLED',
          errorMessage: 'The requesting user is no longer active',
        });
        return;
      }
    }
    await startAction(actionId);
    const handler = handlers.get(action.feature);
    if (!handler) throw new AiProviderError('CAPABILITY_UNSUPPORTED', `No handler is registered for ${action.feature}`);
    await handler(actionId);
    const latest = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
    if (latest?.status === 'running') await finishAction(actionId, 'completed');
  } catch (error) {
    if (error instanceof DomainError) {
      await finishAction(actionId, error.code === 'CANCELLED' ? 'cancelled' : 'failed', {
        errorCode: error.code,
        errorMessage: error.message,
      });
      return;
    }
    const normalized = normalizeProviderError(error);
    await finishAction(actionId, normalized.code === 'CANCELLED' ? 'cancelled' : 'failed', {
      errorCode: normalized.code,
      errorMessage: normalized.message,
    });
    if (normalized.retryable) throw normalized;
  }
}
