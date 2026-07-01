import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import * as pageService from '@/server/services/pages';
import * as publicContent from '@/server/services/public-content';
import {
  createPublicApiUser,
  ensurePublicApiDefaultSpace,
} from '../../../test/public-wiki-api-fixtures';

async function cleanup() {
  await db.delete(schema.apiAuditEntries);
  await db.delete(schema.apiKeys);
  await db.delete(schema.contentAssetRefs);
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.sessions);
  await db.delete(schema.users);
}

describe('public content write facade', () => {
  beforeEach(async () => {
    await cleanup();
    await ensurePublicApiDefaultSpace();
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('creates pages, drafts, properties, and publication through shared services', async () => {
    const editor = await createPublicApiUser('public-write-editor@example.com', 'editor');
    const ctx = buildApiKeyCtx(editor.id, 'editor', ['view', 'create', 'edit'], 'editor-key');

    const page = await publicContent.createPage(
      ctx,
      {
        path: 'public/write',
        title: 'Write',
        contentSource: '# Write',
      },
      ['latestRevision'],
    );
    expect(page.status).toBe('draft');

    const draft = await publicContent.createDraft(ctx, page.id, {
      title: 'Write 2',
      contentSource: '# Write 2',
      baseRevisionId: page.latestRevision?.id,
    });
    expect(draft.version).toBe(2);

    const renamed = await publicContent.updateProperties(ctx, page.id, {
      path: 'public/write-renamed',
      title: 'Write Renamed',
      baseRevisionId: draft.id,
    });
    expect(renamed.path).toBe('public/write-renamed');

    const published = await publicContent.publishRevision(ctx, page.id, 2, { expectedRevisionId: draft.id }, ['publishedRevision']);
    expect(published.publishedRevision?.version).toBe(2);
  });

  it('rejects stale base revisions without creating a new draft', async () => {
    const editor = await createPublicApiUser('public-stale-editor@example.com', 'editor');
    const userCtx = buildUserCtx(editor.id, 'editor');
    const apiCtx = buildApiKeyCtx(editor.id, 'editor', ['view', 'create', 'edit'], 'editor-key');

    const created = await pageService.create(userCtx, {
      path: 'public/stale',
      title: 'Stale',
      contentSource: 'v1',
    });
    await pageService.newDraft(userCtx, 'public/stale', { title: 'Stale', contentSource: 'v2' });

    await expect(
      publicContent.createDraft(apiCtx, created.pageId, {
        title: 'Stale',
        contentSource: 'v3',
        baseRevisionId: created.versionId,
      }),
    ).rejects.toMatchObject({ code: 'STALE_REVISION' });
  });
});
