import { redact, safeErrorCode } from './redaction';
import type { FileOutbox } from './outbox';

export function diagnostics(outbox: FileOutbox, lastError?: unknown): Record<string, unknown> {
  const entries = outbox.list();
  return redact({
    status: lastError ? 'degraded' : 'healthy',
    pending: entries.filter((entry) => ['pending', 'in_flight', 'retryable'].includes(entry.state)).length,
    acknowledged: entries.filter((entry) => entry.state === 'acknowledged').length,
    terminalFailed: entries.filter((entry) => entry.state === 'terminal_failed').length,
    lastErrorCode: lastError ? safeErrorCode(lastError) : null,
  }) as Record<string, unknown>;
}
