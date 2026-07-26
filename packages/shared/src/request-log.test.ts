import { describe, expect, it } from 'vitest';
import {
  requestLogDetailSchema,
  requestLogListQuerySchema,
  updateRequestLogSettingsSchema,
} from './request-log';

describe('request-log schemas', () => {
  it('requires an explicit confirmation when enabling All capture', () => {
    const input = { enabled: true, level: 'all' as const, retentionHours: 24 };
    expect(updateRequestLogSettingsSchema.safeParse(input).success).toBe(false);
    expect(updateRequestLogSettingsSchema.safeParse({ ...input, confirmSensitiveCapture: true }).success).toBe(true);
  });

  it('defaults request-log pagination and rejects an invalid status code', () => {
    expect(requestLogListQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20 });
    expect(requestLogListQuerySchema.safeParse({ statusCode: 99 }).success).toBe(false);
  });

  it('accepts details that omit data unavailable at the selected level', () => {
    const result = requestLogDetailSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000001', sourceType: 'ai', providerKey: 'provider', operation: 'models', attempt: 1, method: 'GET', targetHost: null, targetPath: null, statusCode: 200, outcome: 'success', errorCode: null, errorMessage: null, providerRequestId: null, correlationId: null, model: null, inputTokens: null, outputTokens: null, cachedInputTokens: null, durationMs: 10, captureLevel: 'status', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), expiresAt: new Date().toISOString(), target: null, requestHeaders: null, responseHeaders: null, requestBody: null, responseBody: null, errorDetail: null,
    });
    expect(result.success).toBe(true);
  });
});
