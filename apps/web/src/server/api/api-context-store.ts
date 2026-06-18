import { AsyncLocalStorage } from 'node:async_hooks';
import type { PermCtx } from '@/server/permissions';

export type ApiContext = PermCtx & {
  apiKeyInfo?: { keyId: string; userId: string };
  authError?: string;
};

export const apiContextStore = new AsyncLocalStorage<ApiContext>();

export function getStoredApiContext(): ApiContext | undefined {
  return apiContextStore.getStore();
}
