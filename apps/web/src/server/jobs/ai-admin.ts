import { readActionInput, appendActionEvent, finishAction } from '@/server/services/ai-actions';
import { syncProviderModels, testProvider } from '@/server/services/ai-admin';

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
  const result = await syncProviderModels(input.providerId);
  await finishAction(actionId, 'completed', { resultMetadata: result });
}
