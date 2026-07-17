import { readActionInput, appendActionEvent, finishAction } from '@/server/services/ai-actions';
import { syncProviderModels, testProvider } from '@/server/services/ai-admin';
import { DomainError } from '@/server/errors';

type ProviderInput = { providerId: string };

export async function runProviderTestAction(actionId: string): Promise<void> {
  const input = await readActionInput<ProviderInput>(actionId);
  if (!input) throw new Error('AI provider test input expired');
  const health = await testProvider(input.providerId);
  await appendActionEvent(actionId, 'status', { health });
  if (!health.ok) throw new Error(health.errorMessage ?? 'Provider test failed');
  await finishAction(actionId, 'completed', { resultMetadata: { health } });
}

export async function runModelSyncAction(actionId: string): Promise<void> {
  const input = await readActionInput<ProviderInput>(actionId);
  if (!input) throw new Error('AI model sync input expired');
  try {
    const result = await syncProviderModels(input.providerId);
    // Result already carries detector source, freshness, counts, and safe
    // per-model warnings; no credentials or raw payloads are included.
    await finishAction(actionId, 'completed', { resultMetadata: result });
  } catch (error) {
    // DomainError messages are already safe for admin display; the detector
    // layer sanitized them before they were rethrown as DomainError.
    const code = error instanceof DomainError ? error.code : 'PROVIDER_UNAVAILABLE';
    const message = error instanceof Error ? error.message : 'Model sync failed';
    await finishAction(actionId, 'failed', { errorCode: code, errorMessage: message });
    throw error;
  }
}
