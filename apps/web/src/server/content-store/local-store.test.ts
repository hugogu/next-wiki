import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { LocalStore } from './local-store';
import { runContentStoreConformance } from './content-store.conformance';

// Created synchronously at load time so the conformance suite (registered at
// module evaluation) captures a fully-constructed store.
const baseDir = mkdtempSync(path.join(tmpdir(), 'next-wiki-local-'));
const store = new LocalStore(baseDir);
let userId: string;

async function cleanup() {
  await db.delete(schema.contentAssets);
  await db.delete(schema.users);
}

beforeAll(async () => {
  await cleanup();
  const [user] = await db
    .insert(schema.users)
    .values({ email: `local-${randomUUID()}@example.com`, passwordHash: 'HASH', role: 'editor' })
    .returning();
  userId = user!.id;
});

afterAll(async () => {
  rmSync(baseDir, { recursive: true, force: true });
  await cleanup();
  await closeDb();
});

runContentStoreConformance({
  label: 'LocalStore',
  store,
  async provisionMarkdownKey() {
    return randomUUID();
  },
  async provisionImageKey(contentType: string) {
    const [asset] = await db
      .insert(schema.contentAssets)
      .values({ kind: 'image', contentHash: 'h', contentType, sizeBytes: 0, createdBy: userId })
      .returning();
    return asset!.id;
  },
  unknownKey() {
    return randomUUID();
  },
});

describe('LocalStore namespace confinement', () => {
  it('rejects keys that would escape the managed namespace', async () => {
    await expect(store.getMarkdown('../escape')).rejects.toThrow(/Unsafe/);
    await expect(store.getImage('../../etc/passwd')).rejects.toThrow(/Unsafe/);
    await expect(store.putImage('a/b', Buffer.from([1]), 'image/png')).rejects.toThrow(/Unsafe/);
  });

  it('reports a healthy writable base directory', async () => {
    expect((await store.healthCheck()).ok).toBe(true);
  });
});
