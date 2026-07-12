import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { runTransferImport } from './transfer-import';

const mocks = vi.hoisted(() => ({
  WikiJsClient: vi.fn(),
  getRuntimeSource: vi.fn(),
  getTransferConverter: vi.fn(),
  writeImportedPage: vi.fn(),
  writeImportedAsset: vi.fn(),
  localizeWikiJsImage: vi.fn(),
  enqueueGitExport: vi.fn(),
}));

vi.mock('@/server/transfers/wikijs-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/transfers/wikijs-client')>()),
  WikiJsClient: mocks.WikiJsClient,
}));

vi.mock('@/server/services/transfer-sources', () => ({
  getRuntimeSource: mocks.getRuntimeSource,
}));

vi.mock('@/server/transfers/registry', () => ({
  getTransferConverter: mocks.getTransferConverter,
}));

vi.mock('@/server/services/transfer-page-writer', () => ({
  writeImportedPage: mocks.writeImportedPage,
}));

vi.mock('@/server/services/transfer-asset-writer', () => ({
  writeImportedAsset: mocks.writeImportedAsset,
}));

vi.mock('@/server/services/transfer-wikijs-assets', () => ({
  localizeWikiJsImage: mocks.localizeWikiJsImage,
}));

vi.mock('@/server/services/git-export', () => ({
  enqueueGitExport: mocks.enqueueGitExport,
}));

const TRUNCATE =
  'TRUNCATE TABLE transfer_page_mappings, transfer_asset_mappings, transfer_items, transfer_runs, transfer_artifacts, transfer_sources, page_revisions, pages, users, spaces RESTART IDENTITY CASCADE';

type PageDef = {
  id: number;
  path: string;
  locale: string;
  title: string;
  contentType?: string;
  editor?: string;
  content: string;
  fingerprint: string;
  tags?: Array<string | { tag: string; title?: string }>;
  action?: 'create' | 'replace' | 'skip';
  unsupported?: boolean;
};

let adminId: string;
let sourceId: string;

beforeAll(async () => {
  await db.execute(sql.raw(TRUNCATE));
  const [admin] = await db
    .insert(schema.users)
    .values({
      email: `import-${randomUUID()}@example.com`,
      passwordHash: 'TEST',
      role: 'admin',
    })
    .returning();
  adminId = admin!.id;

  await db.insert(schema.spaces).values({ slug: 'default', name: 'Default' });

  const [source] = await db
    .insert(schema.transferSources)
    .values({
      name: 'Wiki.js Test',
      baseUrl: 'http://wiki.example.com',
      allowPrivateNetwork: false,
      credentialsEncrypted: 'encrypted',
      status: 'healthy',
      createdBy: adminId,
    })
    .returning();
  sourceId = source!.id;

  mocks.getRuntimeSource.mockResolvedValue({
    id: sourceId,
    baseUrl: 'http://wiki.example.com',
    apiToken: 'token',
    allowPrivateNetwork: false,
  });
});

afterAll(async () => {
  await db.execute(sql.raw(TRUNCATE));
  await closeDb();
  vi.restoreAllMocks();
});

async function seedImport(opts: { pages: PageDef[] }) {
  const pageIds = new Map<string, string>();

  for (const page of opts.pages) {
    if (page.unsupported) continue;
    const [row] = await db
      .insert(schema.pages)
      .values({
        spaceId: (await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'default') }))!.id,
        slug: page.path.split('/').at(-1) ?? page.path,
        path: page.path,
        locale: page.locale,
        title: page.title,
        authorId: adminId,
      })
      .returning({ id: schema.pages.id });
    pageIds.set(`${page.locale}/${page.path}`, row!.id);
  }

  const [preview] = await db
    .insert(schema.transferRuns)
    .values({
      kind: 'wikijs_preview',
      status: 'completed',
      actorUserId: adminId,
      sourceId,
      options: { conflictStrategy: 'skip' },
      totalItems: opts.pages.length,
      processedItems: opts.pages.length,
      createdItems: opts.pages.filter((p) => p.action === 'create').length,
      replacedItems: opts.pages.filter((p) => p.action === 'replace').length,
      skippedItems: opts.pages.filter((p) => p.action === 'skip' || p.unsupported).length,
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    .returning();

  await db.insert(schema.transferItems).values(
    opts.pages.map((page) => ({
      runId: preview!.id,
      kind: 'page' as const,
      sourceKey: String(page.id),
      sourceFingerprint: page.fingerprint,
      displayName: `${page.locale}/${page.path}`,
      targetKey: `${page.locale}/${page.path}`,
      action: (page.unsupported ? 'skip' : page.action ?? 'create') as 'create' | 'replace' | 'skip',
      status: (page.unsupported ? 'warning' : 'completed') as 'warning' | 'completed',
      warningCode: page.unsupported ? 'UNSUPPORTED_SOURCE_CONTENT' : null,
      metadata: page.unsupported ? { contentType: page.contentType } : { targetAction: page.action ?? 'create' },
      finishedAt: new Date(),
    })),
  );

  const [run] = await db
    .insert(schema.transferRuns)
    .values({
      kind: 'wikijs_import',
      status: 'queued',
      actorUserId: adminId,
      sourceId,
      previewRunId: preview!.id,
      options: { conflictStrategy: 'skip' },
      expiresAt: new Date(Date.now() + 3_600_000),
    })
    .returning();

  mocks.WikiJsClient.mockImplementation(() => ({
    getPage: vi.fn(async (id: number) => {
      const page = opts.pages.find((p) => p.id === id);
      if (!page) throw new Error(`Page not found: ${id}`);
      return {
        id: page.id,
        path: page.path,
        locale: page.locale,
        title: page.title,
        contentType: page.contentType ?? 'text/markdown',
        editor: page.editor ?? 'markdown',
        content: page.content,
        tags: page.tags,
        fingerprint: page.fingerprint,
      };
    }),
  }));

  mocks.getTransferConverter.mockImplementation(() => (content: string) => ({
    markdown: content,
    converted: false,
  }));

  mocks.writeImportedPage.mockImplementation(async (input: { path: string; locale: string; action: 'create' | 'replace' | 'skip' }) => ({
    pageId: pageIds.get(`${input.locale}/${input.path}`) ?? null,
    revisionId: randomUUID(),
    action: input.action,
  }));

  mocks.localizeWikiJsImage.mockResolvedValue('/api/assets/mock');
  mocks.enqueueGitExport.mockResolvedValue(undefined);

  return { previewId: preview!.id, runId: run!.id, pageIds };
}

describe('runTransferImport wikijs_import', () => {
  it('writes Wiki.js tags into synchronized Markdown frontmatter', async () => {
    const pages: PageDef[] = [{
      id: 9,
      path: 'docs/tagged',
      locale: 'en',
      title: 'Tagged',
      content: '# Tagged',
      fingerprint: 'fp9',
      tags: [
        { tag: 'devops', title: 'DevOps' },
        { tag: 'docker', title: 'Docker' },
        { tag: 'DEVOPS', title: ' devops ' },
      ],
    }];
    const { runId } = await seedImport({ pages });

    await runTransferImport(runId);

    const completed = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, runId) });
    expect(completed?.status, completed?.errorMessage ?? undefined).toBe('completed');
    expect(mocks.writeImportedPage).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Tagged',
      markdown: expect.stringContaining('tags:\n  - DevOps\n  - Docker'),
    }));
  });

  it('sets totalItems before processing and advances processedItems during the loop', async () => {
    const pages: PageDef[] = [
      { id: 10, path: 'docs/progress-one', locale: 'en', title: 'One', content: '# One', fingerprint: 'fp10' },
      { id: 11, path: 'docs/progress-two', locale: 'en', title: 'Two', content: '# Two', fingerprint: 'fp11' },
    ];
    const { runId, pageIds } = await seedImport({ pages });

    const observed: { call: number; totalItems: number; processedItems: number }[] = [];
    mocks.writeImportedPage.mockImplementation(async (input: { path: string; locale: string; action: 'create' | 'replace' | 'skip' }) => {
      const run = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, runId) });
      observed.push({
        call: observed.length + 1,
        totalItems: run?.totalItems ?? -1,
        processedItems: run?.processedItems ?? -1,
      });
      return {
        pageId: pageIds.get(`${input.locale}/${input.path}`) ?? null,
        revisionId: randomUUID(),
        action: input.action,
      };
    });

    await runTransferImport(runId);

    expect(observed).toHaveLength(2);
    expect(observed[0]).toEqual({ call: 1, totalItems: 2, processedItems: 0 });
    expect(observed[1]).toEqual({ call: 2, totalItems: 2, processedItems: 1 });
  });

  it('updates progress counters after each page', async () => {
    const pages: PageDef[] = [
      { id: 1, path: 'docs/one', locale: 'en', title: 'One', content: '# One', fingerprint: 'fp1' },
      { id: 2, path: 'docs/two', locale: 'en', title: 'Two', content: '# Two', fingerprint: 'fp2' },
      { id: 3, path: 'docs/three', locale: 'zh', title: 'Three', content: '# Three', fingerprint: 'fp3' },
    ];
    const { runId } = await seedImport({ pages });

    await runTransferImport(runId);

    const updated = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, runId) });
    expect(updated?.status).toBe('completed');
    expect(updated?.totalItems).toBe(3);
    expect(updated?.processedItems).toBe(3);
    expect(updated?.createdItems).toBe(3);
    expect(updated?.replacedItems).toBe(0);
    expect(updated?.skippedItems).toBe(0);
  });

  it('stops promptly and marks the run cancelled when cancellation is requested mid-run', async () => {
    const pages: PageDef[] = [
      { id: 20, path: 'docs/cancel-one', locale: 'en', title: 'One', content: '# One', fingerprint: 'fp20' },
      { id: 21, path: 'docs/cancel-two', locale: 'en', title: 'Two', content: '# Two', fingerprint: 'fp21' },
    ];
    const { runId, pageIds } = await seedImport({ pages });
    mocks.enqueueGitExport.mockClear();

    // Simulate the operator clicking "Cancel Run" right after the first page
    // lands; the loop must notice the live flag and stop before the second.
    mocks.writeImportedPage.mockImplementation(async (input: { path: string; locale: string; action: 'create' | 'replace' | 'skip' }) => {
      await db.update(schema.transferRuns).set({ cancelRequested: true }).where(eq(schema.transferRuns.id, runId));
      return {
        pageId: pageIds.get(`${input.locale}/${input.path}`) ?? null,
        revisionId: randomUUID(),
        action: input.action,
      };
    });

    await runTransferImport(runId);

    const updated = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, runId) });
    expect(updated?.status).toBe('cancelled');
    expect(updated?.processedItems).toBe(1);
    // A cancelled partial import must not trigger a git snapshot export.
    expect(mocks.enqueueGitExport).not.toHaveBeenCalled();
  });

  it('pauses mid-run and resumes to finish only the remaining pages', async () => {
    const pages: PageDef[] = [
      { id: 30, path: 'docs/pause-one', locale: 'en', title: 'One', content: '# One', fingerprint: 'fp30' },
      { id: 31, path: 'docs/pause-two', locale: 'en', title: 'Two', content: '# Two', fingerprint: 'fp31' },
    ];
    const { runId, pageIds } = await seedImport({ pages });
    mocks.enqueueGitExport.mockClear();

    // First segment: request a pause right after the first page lands.
    let writes = 0;
    mocks.writeImportedPage.mockImplementation(async (input: { path: string; locale: string; action: 'create' | 'replace' | 'skip' }) => {
      writes += 1;
      await db.update(schema.transferRuns).set({ pauseRequested: true }).where(eq(schema.transferRuns.id, runId));
      return { pageId: pageIds.get(`${input.locale}/${input.path}`) ?? null, revisionId: randomUUID(), action: input.action };
    });

    await runTransferImport(runId);

    let run = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, runId) });
    expect(run?.status).toBe('paused');
    expect(run?.processedItems).toBe(1);
    expect(run?.pauseRequested).toBe(false); // honored request is cleared
    expect(writes).toBe(1);
    expect(mocks.enqueueGitExport).not.toHaveBeenCalled();

    // Second segment: emulate resume (requeue) and re-run the worker.
    mocks.writeImportedPage.mockImplementation(async (input: { path: string; locale: string; action: 'create' | 'replace' | 'skip' }) => {
      writes += 1;
      return { pageId: pageIds.get(`${input.locale}/${input.path}`) ?? null, revisionId: randomUUID(), action: input.action };
    });
    await db.update(schema.transferRuns).set({ status: 'queued', pauseRequested: false }).where(eq(schema.transferRuns.id, runId));

    await runTransferImport(runId);

    run = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, runId) });
    expect(run?.status).toBe('completed');
    expect(run?.processedItems).toBe(2);
    // The already-imported first page is skipped on resume — only page two is written.
    expect(writes).toBe(2);
    expect(mocks.enqueueGitExport).toHaveBeenCalledTimes(1);
  });

  it('counts unsupported preview items as skipped progress', async () => {
    const pages: PageDef[] = [
      { id: 4, path: 'docs/unsupported-one', locale: 'en', title: 'One', content: '# One', fingerprint: 'fp4' },
      { id: 5, path: 'docs/unsupported-two', locale: 'en', title: 'Two', content: '# Two', fingerprint: 'fp5', unsupported: true },
      { id: 6, path: 'docs/unsupported-three', locale: 'zh', title: 'Three', content: '# Three', fingerprint: 'fp6' },
    ];
    const { runId } = await seedImport({ pages });

    await runTransferImport(runId);

    const updated = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, runId) });
    expect(updated?.status).toBe('completed_with_warnings');
    expect(updated?.totalItems).toBe(3);
    expect(updated?.processedItems).toBe(3);
    expect(updated?.createdItems).toBe(2);
    expect(updated?.skippedItems).toBe(1);
    expect(updated?.warningItems).toBe(1);
  });
});
