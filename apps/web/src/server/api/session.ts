import { getCurrentActor } from '@/server/services/auth';
import { getStoredApiContext } from './api-context-store';
import type { PermCtx } from '@/server/permissions';

export async function createApiContext(): Promise<PermCtx> {
  const stored = getStoredApiContext();
  if (stored) {
    return { actor: stored.actor };
  }
  const actor = await getCurrentActor();
  return { actor };
}
