import { z } from 'zod';
import { runWithoutDataCache } from '@/server/cache/public-cache';
import { runEvidenceCapture } from '@/server/services/agent-memory';
import { logger } from '@/server/logger';

type CaptureJobData = {
  captureId: string;
};

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
