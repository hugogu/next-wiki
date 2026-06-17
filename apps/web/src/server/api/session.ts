import { getCurrentActor } from '@/server/services/auth';
import type { PermCtx } from '@/server/permissions';

export async function createApiContext(): Promise<PermCtx> {
  const actor = await getCurrentActor();
  return { actor };
}
