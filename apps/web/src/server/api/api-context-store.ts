import { AsyncLocalStorage } from 'node:async_hooks';
import type { PermCtx } from '@/server/permissions';
import type { RequestLogSettingsAuditMetadata } from '@next-wiki/shared';

export type ApiContext = PermCtx & {
  apiKeyInfo?: { keyId: string; userId: string };
  authError?: string;
  auditMetadata?: RequestLogSettingsAuditMetadata | null;
};

export const apiContextStore = new AsyncLocalStorage<ApiContext>();

export function getStoredApiContext(): ApiContext | undefined {
  return apiContextStore.getStore();
}

export function setApiAuditMetadata(metadata: RequestLogSettingsAuditMetadata): void {
  const context = apiContextStore.getStore();
  if (context) context.auditMetadata = metadata;
}
