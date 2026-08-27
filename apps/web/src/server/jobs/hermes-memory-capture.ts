import { z } from 'zod';
import { runWithoutDataCache } from '@/server/cache/public-cache';
import { runEvidenceCapture } from '@/server/services/hermes-memory';
import { logger } from '@/server/logger';

type CaptureJobData = {
  captureId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
};

const captureJobDataSchema = z.object({
  captureId: z.string().uuid(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(64_000),
  })).min(1).max(100),
});

export function isCaptureJobData(data: unknown): data is CaptureJobData {
  return captureJobDataSchema.safeParse(data).success;
}

export async function runHermesMemoryCapture(data: unknown): Promise<void> {
  if (!isCaptureJobData(data)) {
    logger.warn('hermes-memory-capture received a malformed job payload');
    return;
  }
  await runWithoutDataCache(() => runEvidenceCapture(data));
}
