import { eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import {
  ContentNotFoundError,
  type ContentStore,
  type StorageBackendType,
} from './types';

/**
 * Executor accepted by the store: the global `db` connection or a Drizzle
 * transaction handle. Image bytes and asset metadata can therefore be written
 * in a single transaction (plan D3a).
 */
export type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The default, zero-configuration backend. Markdown stays in
 * `page_revisions.content_source`; image bytes live in `content_blobs`. Asset
 * and revision metadata always live in the database regardless of backend, so
 * this store only moves the raw bytes.
 */
export class DatabaseStore implements ContentStore {
  readonly type: StorageBackendType = 'database';

  constructor(private readonly exec: DbExecutor = db) {}

  async putMarkdown(revisionId: string, source: string): Promise<void> {
    await this.exec
      .update(schema.pageRevisions)
      .set({ contentSource: source })
      .where(eq(schema.pageRevisions.id, revisionId));
  }

  async getMarkdown(revisionId: string): Promise<string> {
    const [row] = await this.exec
      .select({ source: schema.pageRevisions.contentSource })
      .from(schema.pageRevisions)
      .where(eq(schema.pageRevisions.id, revisionId))
      .limit(1);
    if (!row || row.source === null) {
      throw new ContentNotFoundError(this.type, `markdown/${revisionId}`);
    }
    return row.source;
  }

  async putImage(assetId: string, bytes: Buffer): Promise<void> {
    // Idempotent: re-putting the same key overwrites the bytes (safe migration
    // retry — FR-022). The content type lives in `content_assets`.
    await this.exec
      .insert(schema.contentBlobs)
      .values({ assetId, bytes })
      .onConflictDoUpdate({ target: schema.contentBlobs.assetId, set: { bytes } });
  }

  async getImage(assetId: string): Promise<{ bytes: Buffer; contentType: string }> {
    const [row] = await this.exec
      .select({
        bytes: schema.contentBlobs.bytes,
        contentType: schema.contentAssets.contentType,
      })
      .from(schema.contentBlobs)
      .innerJoin(schema.contentAssets, eq(schema.contentBlobs.assetId, schema.contentAssets.id))
      .where(eq(schema.contentBlobs.assetId, assetId))
      .limit(1);
    if (!row) {
      throw new ContentNotFoundError(this.type, `assets/${assetId}`);
    }
    return { bytes: row.bytes, contentType: row.contentType };
  }

  async deleteImage(assetId: string): Promise<void> {
    await this.exec.delete(schema.contentBlobs).where(eq(schema.contentBlobs.assetId, assetId));
  }

  async *listMarkdownKeys(): AsyncIterable<string> {
    const rows = await this.exec
      .select({ id: schema.pageRevisions.id })
      .from(schema.pageRevisions);
    for (const row of rows) yield row.id;
  }

  async *listImageKeys(): AsyncIterable<string> {
    const rows = await this.exec
      .select({ id: schema.contentAssets.id })
      .from(schema.contentAssets)
      .where(isNull(schema.contentAssets.deletedAt));
    for (const row of rows) yield row.id;
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    // The database is already a hard requirement, so it is trivially healthy.
    return { ok: true };
  }
}
