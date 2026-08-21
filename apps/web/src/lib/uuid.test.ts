import { describe, expect, it, vi } from 'vitest';
import { uuid } from './uuid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('uuid', () => {
  it('returns an RFC 4122 v4 UUID when crypto.randomUUID is available', () => {
    expect(uuid()).toMatch(UUID_V4);
  });

  it('falls back to crypto.getRandomValues when crypto.randomUUID is missing (insecure context)', () => {
    // `randomUUID` lives on Crypto.prototype, so `delete` on the crypto
    // instance is a no-op and the real method stays reachable — shadow it
    // with an own property instead so the fallback branch is genuinely hit.
    const originalRandomUUID = globalThis.crypto.randomUUID;
    (globalThis.crypto as { randomUUID?: () => string }).randomUUID = undefined;
    const getRandomValuesSpy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    try {
      expect(uuid()).toMatch(UUID_V4);
      expect(getRandomValuesSpy).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.crypto.randomUUID = originalRandomUUID;
      getRandomValuesSpy.mockRestore();
    }
  });

  it('falls back to Math.random when both crypto APIs are missing', () => {
    const originalRandomUUID = globalThis.crypto.randomUUID;
    const originalGetRandomValues = globalThis.crypto.getRandomValues;
    (globalThis.crypto as { randomUUID?: () => string }).randomUUID = undefined;
    (globalThis.crypto as { getRandomValues?: unknown }).getRandomValues = undefined;
    try {
      expect(uuid()).toMatch(UUID_V4);
    } finally {
      globalThis.crypto.randomUUID = originalRandomUUID;
      globalThis.crypto.getRandomValues = originalGetRandomValues;
    }
  });

  it('emits 1000 unique values across rapid calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(uuid());
    expect(ids.size).toBe(1000);
  });

  it('always sets the v4 version nibble and RFC 4122 variant', () => {
    // 100 samples is plenty to catch any off-by-one in the byte masking.
    for (let i = 0; i < 100; i++) {
      const id = uuid();
      expect(id[14]).toBe('4');
      expect('89ab').toContain((id[19] ?? '').toLowerCase());
    }
  });
});
