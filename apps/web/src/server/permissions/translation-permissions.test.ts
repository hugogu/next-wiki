import { describe, expect, it } from 'vitest';
import { buildAnonymousCtx, buildApiKeyCtx, buildUserCtx, can } from '.';

describe('translation permissions', () => {
  it('allows only administrator sessions to manage translations', () => {
    expect(can(buildUserCtx('a', 'admin'), 'manage_translations', { kind: 'translations' })).toBe(
      true,
    );
    expect(can(buildUserCtx('e', 'editor'), 'manage_translations', { kind: 'translations' })).toBe(
      false,
    );
    expect(can(buildUserCtx('r', 'reader'), 'manage_translations', { kind: 'translations' })).toBe(
      false,
    );
    expect(can(buildAnonymousCtx(), 'manage_translations', { kind: 'translations' })).toBe(false);
  });

  it('never grants manage_translations to an API key, even an admin key', () => {
    // Translation management is deliberately not exposed to API keys or MCP in
    // this feature — no scope maps to it and the api_key branch denies it.
    for (const scope of ['view', 'create', 'edit', 'delete', 'transfers'] as const) {
      expect(
        can(buildApiKeyCtx('a', 'admin', [scope], 'k'), 'manage_translations', {
          kind: 'translations',
        }),
      ).toBe(false);
    }
  });
});
