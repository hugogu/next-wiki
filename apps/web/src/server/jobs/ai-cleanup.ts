import { cleanupExpiredAiData } from '@/server/services/ai-actions';

export async function runAiCleanup(): Promise<void> {
  await cleanupExpiredAiData();
}
