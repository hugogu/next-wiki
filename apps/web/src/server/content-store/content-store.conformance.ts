import { describe, it, expect } from 'vitest';
import type { ContentStore } from './types';
import { ContentNotFoundError } from './types';

/**
 * Reusable ContentStore conformance suite (constitution P9 / contract test
 * section). Every backend implementation must satisfy the same behavioral
 * contract: round trips, idempotency, missing-key errors, enumeration, atomic
 * visibility, deletion, and health checks. A harness provisions backend-valid
 * keys (image/asset metadata always lives in the DB regardless of backend).
 *
 * Defined as a plain module (not a `*.test.ts`) so it can be imported and run
 * by each backend's own test file without executing twice.
 */
export interface ConformanceHarness {
  label: string;
  store: ContentStore;
  /** Create a revision row valid as a markdown key for this backend. */
  provisionMarkdownKey(): Promise<string>;
  /** Create a `content_assets` row (with the given type) valid as an image key. */
  provisionImageKey(contentType: string): Promise<string>;
  /** A correctly-shaped id that no content exists for. */
  unknownKey(): string;
}

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const k of iter) out.push(k);
  return out;
}

export function runContentStoreConformance(harness: ConformanceHarness): void {
  const { store } = harness;

  describe(`ContentStore conformance: ${harness.label}`, () => {
    it('reports its declared type and a healthy backend', async () => {
      expect(store.type).toBeTruthy();
      const health = await store.healthCheck();
      expect(health.ok).toBe(true);
    });

    it('round-trips markdown', async () => {
      const key = await harness.provisionMarkdownKey();
      await store.putMarkdown(key, '# Hello\n\nworld');
      expect(await store.getMarkdown(key)).toBe('# Hello\n\nworld');
    });

    it('overwriting markdown with the same key is idempotent from the reader', async () => {
      const key = await harness.provisionMarkdownKey();
      await store.putMarkdown(key, 'first');
      await store.putMarkdown(key, 'second');
      await store.putMarkdown(key, 'second');
      expect(await store.getMarkdown(key)).toBe('second');
    });

    it('throws ContentNotFoundError for missing markdown', async () => {
      await expect(store.getMarkdown(harness.unknownKey())).rejects.toBeInstanceOf(
        ContentNotFoundError,
      );
    });

    it('round-trips image bytes and content type', async () => {
      const key = await harness.provisionImageKey('image/png');
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
      await store.putImage(key, bytes, 'image/png');
      const got = await store.getImage(key);
      expect(got.bytes.equals(bytes)).toBe(true);
      expect(got.contentType).toBe('image/png');
    });

    it('overwriting image bytes with the same key is idempotent', async () => {
      const key = await harness.provisionImageKey('image/png');
      await store.putImage(key, Buffer.from([1, 1, 1]), 'image/png');
      const next = Buffer.from([2, 2, 2, 2]);
      await store.putImage(key, next, 'image/png');
      expect((await store.getImage(key)).bytes.equals(next)).toBe(true);
    });

    it('throws ContentNotFoundError for missing image', async () => {
      await expect(store.getImage(harness.unknownKey())).rejects.toBeInstanceOf(
        ContentNotFoundError,
      );
    });

    it('enumerates written keys', async () => {
      const mdKey = await harness.provisionMarkdownKey();
      await store.putMarkdown(mdKey, 'enumerated');
      const imgKey = await harness.provisionImageKey('image/png');
      await store.putImage(imgKey, Buffer.from([9, 9, 9]), 'image/png');

      expect(await collect(store.listMarkdownKeys())).toContain(mdKey);
      expect(await collect(store.listImageKeys())).toContain(imgKey);
    });

    it('deletes image bytes', async () => {
      const key = await harness.provisionImageKey('image/png');
      await store.putImage(key, Buffer.from([5, 5, 5]), 'image/png');
      await store.deleteImage(key);
      await expect(store.getImage(key)).rejects.toBeInstanceOf(ContentNotFoundError);
    });
  });
}
