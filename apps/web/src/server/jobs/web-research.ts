import { runWithoutDataCache } from '@/server/cache/public-cache';
import { finishAction } from '@/server/services/ai-actions';
import {
  executeWebResearchConnectionTest,
  persistWebResearchConnectionTest,
  recordWebResearchConnectionAttempt,
} from '@/server/web-research/connection-test';

/**
 * Legacy queue handler retained for actions created before connection tests
 * became synchronous. New requests use the admin service directly and never
 * enqueue a worker job.
 */
export async function runWebResearchTestAction(actionId: string): Promise<void> {
  await runWithoutDataCache(async () => {
    const result = await executeWebResearchConnectionTest();
    await persistWebResearchConnectionTest(result);
    await recordWebResearchConnectionAttempt(actionId, result);
    const resultMetadata = {
      provider: result.provider,
      status: result.status,
      latencyMs: result.latencyMs,
      ...(result.providerRequestId ? { providerRequestId: result.providerRequestId } : {}),
      ...(result.creditsUsed === undefined ? {} : { creditsUsed: result.creditsUsed }),
      ...(result.candidateCount === undefined ? {} : { candidateCount: result.candidateCount }),
    };
    if (result.ok) {
      await finishAction(actionId, 'completed', { resultMetadata });
    } else {
      await finishAction(actionId, 'failed', {
        resultMetadata,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
    }
  });
}
