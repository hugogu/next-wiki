import { describe, expect, it } from 'vitest';
import { buildAnonymousCtx, buildApiKeyCtx, buildUserCtx, can } from '.';

describe('transfer permissions', () => {
  it('allows administrators and scoped admin API keys only', () => {
    expect(can(buildUserCtx('a', 'admin'), 'manage_transfers', { kind: 'transfers' })).toBe(true);
    expect(can(buildUserCtx('e', 'editor'), 'manage_transfers', { kind: 'transfers' })).toBe(false);
    expect(can(buildUserCtx('r', 'reader'), 'manage_transfers', { kind: 'transfers' })).toBe(false);
    expect(can(buildAnonymousCtx(), 'manage_transfers', { kind: 'transfers' })).toBe(false);
    expect(
      can(buildApiKeyCtx('a', 'admin', ['transfers'], 'k'), 'manage_transfers', {
        kind: 'transfers',
      }),
    ).toBe(true);
    expect(
      can(buildApiKeyCtx('a', 'admin', ['view'], 'k'), 'manage_transfers', {
        kind: 'transfers',
      }),
    ).toBe(false);
    expect(
      can(buildApiKeyCtx('e', 'editor', ['transfers'], 'k'), 'manage_transfers', {
        kind: 'transfers',
      }),
    ).toBe(false);
  });
});
