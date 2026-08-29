import { z } from 'zod';
import { runWithoutDataCache } from '@/server/cache/public-cache';
import { runEvidenceCapture } from '@/server/services/agent-memory-captures';
import { logger } from '@/server/logger';

// 040: capture-ID-only job payload. The worker fetches and decrypts the
// bounded transient envelope from the capture row itself; the pg-boss job
// never carries evidence content (data-model.md capture ledger invariant).
type CaptureJobData = {
  captureId: string;
};

// .strict() rejects any extra key (e.g. a legacy `messages` field from a job
// enqueued before this deploy) rather than silently ignoring it, so evidence
// content can never reach this schema even by accident.
const captureJobDataSchema = z.object({
  captureId: z.string().uuid(),
}).strict();

export function isCaptureJobData(data: unknown): data is CaptureJobData {
  return captureJobDataSchema.safeParse(data).success;
}

export async function runAgentMemoryCapture(data: unknown): Promise<void> {
  if (!isCaptureJobData(data)) {
    logger.warn('agent-memory-capture received a malformed job payload');
    return;
  }
  await runWithoutDataCache(() => runEvidenceCapture(data));
}
