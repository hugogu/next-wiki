import { logger } from '@/server/logger';
import { captureConversation } from '@/server/services/raw-conversations';
import { writeEntry } from '@/server/services/audit';

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
 *
 * 025 (US6): every successful capture also writes an audit entry whose
 * `origin` mirrors the capture's channel (`'feishu'` → `'feishu'`, anything
 * else → `'web'`), so Admins can trace a Feishu-captured turn through the
 * same audit surface as a web capture. The entry carries only the action id
 * (via `path`) and a bounded, non-secret correlation id — never the raw
 * question, answer, or any credential (see D4, 019 FR-027).
 */
export async function runRawConversationCapture(data: unknown): Promise<void> {
  if (!isRawConversationCaptureJobData(data)) {
    logger.warn('raw-conversation-capture received a malformed job payload', { data });
    return;
  }
  const outcome = await captureConversation(data.actionId);
  if (outcome.status === 'failed') {
    logger.warn('raw-conversation-capture failed', { actionId: data.actionId, error: outcome.error });
    return;
  }
  if (outcome.status === 'captured') {
    await writeEntry({
      keyId: null,
      userId: outcome.actorUserId,
      entryType: 'page',
      method: 'CAPTURE',
      path: `raw-conversation-capture:${data.actionId}`,
      statusCode: 200,
      durationMs: 0,
      authStatus: 'authenticated',
      errorMessage: null,
      origin: outcome.channel === 'feishu' ? 'feishu' : 'web',
      externalCorrelationId: outcome.correlationId,
    });
  }
}
