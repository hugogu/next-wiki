import { logger } from '@/server/logger';

const SECRET_KEYS = /token|secret|credential|content|body/i;

export function auditTransferAction(
  action: string,
  context: Record<string, unknown>,
): void {
  const redacted = Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      SECRET_KEYS.test(key) ? '[REDACTED]' : value,
    ]),
  );
  logger.info('transfer audit', { action, ...redacted });
}
