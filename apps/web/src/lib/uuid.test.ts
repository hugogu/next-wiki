import { describe, expect, it } from 'vitest';
import { uuid } from './uuid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('uuid', () => {
  it('returns an RFC 4122 v4 UUID when crypto.randomUUID is available', () => {
    expect(uuid()).toMatch(UUID_V4);
  });

  it('falls back to crypto.getRandomValues when crypto.randomUUID is missing (insecure context)', () => {
    const original = globalThis.crypto.randomUUID;
    delete (globalThis.crypto as { randomUUID?: () => string }).randomUUID;
    try {
      expect(uuid()).toMatch(UUID_V4);
    } finally {
      globalThis.crypto.randomUUID = original;
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
