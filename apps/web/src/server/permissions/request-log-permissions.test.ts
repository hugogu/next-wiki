import { describe, expect, it } from 'vitest';
import { can, buildApiKeyCtx, buildUserCtx } from '@/server/permissions';

describe('request-log permissions', () => {
  const resource = { kind: 'request_logs' } as const;

  it('allows only an Admin session to manage request logs', () => {
    expect(can(buildUserCtx('admin', 'admin'), 'manage_request_logs', resource)).toBe(true);
    expect(can(buildUserCtx('editor', 'editor'), 'manage_request_logs', resource)).toBe(false);
    expect(can(buildUserCtx('reader', 'reader'), 'manage_request_logs', resource)).toBe(false);
  });

  it('denies API keys even when they have every ordinary scope', () => {
    expect(can(buildApiKeyCtx('user', 'admin', ['view', 'create', 'edit', 'delete', 'share', 'run', 'storage', 'preferences', 'transfers'], 'key'), 'manage_request_logs', resource)).toBe(false);
  });
});
