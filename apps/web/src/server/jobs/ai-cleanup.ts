import { cleanupExpiredAiData, expireOrphanedActions, findActionsWithExpiringCapture } from '@/server/services/ai-actions';
import { captureConversation } from '@/server/services/raw-conversations';
import { logger } from '@/server/logger';

export async function runAiCleanup(): Promise<void> {
  // 023: give every capture-eligible wiki_question action one last,
  // synchronous capture pass before its events are purged below — otherwise
  // any event appended since the last async capture run (or an orphaned
  // conversation stuck in queued/running) is lost forever instead of settling
  // on a final Raw Conversation snapshot.
  const expiringActionIds = await findActionsWithExpiringCapture();
  if (expiringActionIds.length > 0) {
    await expireOrphanedActions(expiringActionIds);
    for (const actionId of expiringActionIds) {
      const outcome = await captureConversation(actionId);
      if (outcome.status === 'failed') {
        logger.warn('final pre-expiry raw conversation capture failed', { actionId, error: outcome.error });
      }
    }
  }
  await cleanupExpiredAiData();
}
