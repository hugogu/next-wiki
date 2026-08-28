import { z } from 'zod';
import { runWithoutDataCache } from '@/server/cache/public-cache';
import { runEvidenceCapture } from '@/server/services/agent-memory';
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
}).superRefine((payload, context) => {
  if (payload.messages.reduce((total, message) => total + message.content.length, 0) > 64_000) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'evidence payload is too large' });
  }
});

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
