import { logger } from '@/server/logger';
import { captureConversation } from '@/server/services/raw-conversations';

export type RawConversationCaptureJobData = { actionId: string };

/** Type guard for the payload pg-boss hands the worker — enqueue call sites
 * are typed, but the queue itself is not, so a malformed/legacy payload must
 * be rejected explicitly rather than crash on `actionId.toString()`. */
export function isRawConversationCaptureJobData(data: unknown): data is RawConversationCaptureJobData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'actionId' in data &&
    typeof (data as { actionId: unknown }).actionId === 'string' &&
    (data as { actionId: string }).actionId.length > 0
  );
}

/**
 * Worker entry point for the `raw-conversation-capture` queue. Capture itself
 * is idempotent and internally records failure state on the action
 * (see `captureConversation`), so this wrapper does not retry on failure —
 * the next Wiki AI event or terminal status re-enqueues a fresh attempt.
 */
export async function runRawConversationCapture(data: unknown): Promise<void> {
  if (!isRawConversationCaptureJobData(data)) {
    logger.warn('raw-conversation-capture received a malformed job payload', { data });
    return;
  }
  const outcome = await captureConversation(data.actionId);
  if (outcome.status === 'failed') {
    logger.warn('raw-conversation-capture failed', { actionId: data.actionId, error: outcome.error });
  }
}
