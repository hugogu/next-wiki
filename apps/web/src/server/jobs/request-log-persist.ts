import { persistOutboundRequestLog } from '@/server/services/request-log';

export async function runRequestLogPersist(payload: Record<string, unknown>): Promise<void> {
  await persistOutboundRequestLog(payload as Parameters<typeof persistOutboundRequestLog>[0]);
}
