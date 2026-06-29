import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import * as pageService from '@/server/services/pages';
import * as revisions from '@/server/services/revisions';
import * as publicContent from '@/server/services/public-content';
import {
  createPublicApiUser,
  ensurePublicApiDefaultSpace,
} from '../../../test/public-wiki-api-fixtures';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function cleanup() {
  await db.delete(schema.apiAuditEntries);
  await db.delete(schema.apiKeys);
  await db.delete(schema.contentAssetRefs);
  await db.delete(schema.contentAssets);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.sessions);
  await db.delete(schema.users);
}

describe('public content asset facade', () => {
  beforeEach(async () => {
    await cleanup();
    await ensurePublicApiDefaultSpace();
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('uploads assets and returns Markdown-ready public references', async () => {
    const editor = await createPublicApiUser('public-asset-editor@example.com', 'editor');
    const asset = await publicContent.uploadAsset(
      buildApiKeyCtx(editor.id, 'editor', ['create'], 'editor-key'),
      PNG,
    );

    expect(asset.url).toBe(`/api/v1/assets/${asset.id}/content`);
    expect(asset.markdown).toBe(`![image](/api/v1/assets/${asset.id}/content)`);
  });

  it('makes referenced assets readable through published page visibility', async () => {
    const editor = await createPublicApiUser('public-asset-page-editor@example.com', 'editor');
    const reader = await createPublicApiUser('public-asset-reader@example.com', 'reader');
    const editorCtx = buildApiKeyCtx(editor.id, 'editor', ['view', 'create', 'edit'], 'editor-key');

    const asset = await publicContent.uploadAsset(editorCtx, PNG);
    await pageService.create(buildUserCtx(editor.id, 'editor'), {
      path: 'public/asset-page',
      title: 'Asset Page',
      contentSource: asset.markdown,
    });
    await revisions.publish(buildUserCtx(editor.id, 'editor'), { path: 'public/asset-page', version: 1 });

    const visible = await publicContent.getAsset(
      buildApiKeyCtx(reader.id, 'reader', ['view'], 'reader-key'),
      asset.id,
    );

    expect(visible?.id).toBe(asset.id);
  });
});
