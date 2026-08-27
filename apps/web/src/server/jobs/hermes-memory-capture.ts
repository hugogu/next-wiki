import { runWithoutDataCache } from '@/server/cache/public-cache';
import { runEvidenceCapture } from '@/server/services/hermes-memory';
import { logger } from '@/server/logger';

type CaptureJobData = {
  captureId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
};

function isCaptureJobData(data: unknown): data is CaptureJobData {
  return typeof data === 'object' && data !== null
    && 'captureId' in data && typeof (data as { captureId?: unknown }).captureId === 'string'
    && 'messages' in data && Array.isArray((data as { messages?: unknown }).messages);
}

export async function runHermesMemoryCapture(data: unknown): Promise<void> {
  if (!isCaptureJobData(data)) {
    logger.warn('hermes-memory-capture received a malformed job payload');
    return;
  }
  await runWithoutDataCache(() => runEvidenceCapture(data));
}
