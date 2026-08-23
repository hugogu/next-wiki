import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { computeWikiJsHistoryFingerprint, type WikiJsHistoryEntry } from '@/server/transfers/wikijs-client';
import { runTransferImport } from './transfer-import';

const mocks = vi.hoisted(() => ({
  WikiJsClient: vi.fn(),
  getRuntimeSource: vi.fn(),
  getTransferConverter: vi.fn(),
  writeImportedPage: vi.fn(),
  writeImportedPageWithHistory: vi.fn(),
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
  writeImportedPageWithHistory: mocks.writeImportedPageWithHistory,
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
  'TRUNCATE TABLE transfer_page_mappings, transfer_asset_mappings, transfer_items, transfer_runs, transfer_artifacts, transfer_sources, page_revisions, pages, translation_languages, users, spaces RESTART IDENTITY CASCADE';

type HistoryVersionDef = WikiJsHistoryEntry & { content: string; contentType?: string; title: string };

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
  history?: HistoryVersionDef[];
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

async function seedImport(opts: { pages: PageDef[]; includeHistory?: boolean; historyLimit?: number }) {
  const pageIds = new Map<string, string>();
  const includeHistory = Boolean(opts.includeHistory);

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

  // Mirrors previewWikiJs: history is only ever fetched/fingerprinted for
  // pages that will actually be written (not 'skip'), so the preview-stage
  // sourceFingerprint recorded here must match what runWikiJsImport
  // recomputes.
  function sourceFingerprintFor(page: PageDef): string {
    const writeAction = page.unsupported ? 'skip' : page.action ?? 'create';
    if (!includeHistory || writeAction === 'skip') return page.fingerprint;
    const trail = [...(page.history ?? [])].sort((a, b) => a.versionId - b.versionId);
    return computeWikiJsHistoryFingerprint(page.fingerprint, trail);
  }

  const [preview] = await db
    .insert(schema.transferRuns)
    .values({
      kind: 'wikijs_preview',
      status: 'completed',
      actorUserId: adminId,
      sourceId,
      options: { conflictStrategy: 'skip', includeHistory, historyLimit: opts.historyLimit ?? 300 },
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
      sourceFingerprint: sourceFingerprintFor(page),
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
      options: { conflictStrategy: 'skip', includeHistory, historyLimit: opts.historyLimit ?? 300 },
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
    listHistory: vi.fn(async (id: number) => {
      const page = opts.pages.find((p) => p.id === id);
      return [...(page?.history ?? [])]
        .sort((a, b) => a.versionId - b.versionId)
        .map(({ versionId, versionDate, authorId, authorName, actionType }) => ({ versionId, versionDate, authorId, authorName, actionType }));
    }),
    getVersion: vi.fn(async (pageId: number, versionId: number) => {
      const page = opts.pages.find((p) => p.id === pageId);
      const version = page?.history?.find((v) => v.versionId === versionId);
      if (!page || !version) throw new Error(`Version not found: ${pageId}/${versionId}`);
      return {
        action: version.actionType,
        authorId: String(version.authorId),
        authorName: version.authorName,
        content: version.content,
        contentType: version.contentType ?? 'text/markdown',
        createdAt: version.versionDate,
        versionDate: version.versionDate,
        locale: page.locale,
        pageId: page.id,
        path: page.path,
        tags: [],
        title: version.title,
        versionId: version.versionId,
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

  mocks.writeImportedPageWithHistory.mockImplementation(async (input: { path: string; locale: string; versions: unknown[]; action: 'create' | 'replace' | 'skip' }) => ({
    pageId: pageIds.get(`${input.locale}/${input.path}`) ?? null,
    revisionIds: input.versions.map(() => randomUUID()),
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

  it('honors cancellation requested while the only page history is being written', async () => {
    const pages: PageDef[] = [{
      id: 22,
      path: 'docs/cancel-history',
      locale: 'en',
      title: 'History',
      content: '# current',
      fingerprint: 'fp22',
      history: [
        { versionId: 1, versionDate: '2026-01-01T00:00:00.000Z', authorId: 1, authorName: 'A', actionType: 'initial', content: '# v1', title: 'V1' },
      ],
    }];
    const { runId, pageIds } = await seedImport({ pages, includeHistory: true });
    mocks.enqueueGitExport.mockClear();
    mocks.writeImportedPageWithHistory.mockImplementation(async (input: { path: string; locale: string; action: 'create' | 'replace' | 'skip' }) => {
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

describe('runTransferImport wikijs_import includeHistory', () => {
  it('fetches and writes the full ordered version history, current version last', async () => {
    const pages: PageDef[] = [{
      id: 50,
      path: 'docs/history-one',
      locale: 'en',
      title: 'Current title',
      content: '# current',
      fingerprint: 'fp50',
      history: [
        { versionId: 1, versionDate: '2026-01-01T00:00:00.000Z', authorId: 7, authorName: 'Alice', actionType: 'initial', content: '# v1', title: 'V1' },
        { versionId: 2, versionDate: '2026-02-01T00:00:00.000Z', authorId: 8, authorName: 'Bob', actionType: 'edit', content: '# v2', title: 'V2' },
      ],
    }];
    const { runId } = await seedImport({ pages, includeHistory: true });
    mocks.writeImportedPageWithHistory.mockClear();

    await runTransferImport(runId);

    const completed = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, runId) });
    expect(completed?.status, completed?.errorMessage ?? undefined).toBe('completed');

    expect(mocks.writeImportedPageWithHistory).toHaveBeenCalledTimes(1);
    const call = mocks.writeImportedPageWithHistory.mock.calls.at(-1)![0] as {
      versions: Array<{ markdown: string; sourceMetadata: Record<string, unknown> }>;
    };
    // Wiki.js's PageVersion.tags is always an array (never undefined), so
    // every historical version round-trips through patchMetadata and gains a
    // frontmatter block — assert on the body, not exact byte equality.
    expect(call.versions.map((v) => v.markdown)).toMatchObject([
      expect.stringContaining('# v1'),
      expect.stringContaining('# v2'),
      '# current',
    ]);
    expect(call.versions.at(-1)!.sourceMetadata.isCurrent).toBe(true);
    expect(call.versions[0]!.sourceMetadata.wikijsVersionId).toBe(1);
  });

  it('records a single stale page as a failed item instead of aborting the whole run', async () => {
    const pages: PageDef[] = [
      {
        id: 51,
        path: 'docs/history-stale',
        locale: 'en',
        title: 'T',
        content: '# current',
        fingerprint: 'fp51',
        history: [
          { versionId: 1, versionDate: '2026-01-01T00:00:00.000Z', authorId: 1, authorName: 'A', actionType: 'initial', content: '# v1', title: 'V1' },
        ],
      },
      { id: 52, path: 'docs/history-fine', locale: 'en', title: 'Fine', content: '# fine', fingerprint: 'fp52' },
    ];
    const { runId } = await seedImport({ pages, includeHistory: true });
    // Simulate a new edit landing on Wiki.js after the preview snapshot was taken.
    pages[0]!.history!.push({
      versionId: 2, versionDate: '2026-03-01T00:00:00.000Z', authorId: 2, authorName: 'B', actionType: 'edit', content: '# v2', title: 'V2',
    });
    mocks.writeImportedPageWithHistory.mockClear();

    await runTransferImport(runId);

    const updated = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, runId) });
    // A single bad item degrades the run to warnings, not a hard failure —
    // the other (unaffected) page still gets processed normally below.
    expect(updated?.status).toBe('completed_with_warnings');
    expect(updated?.failedItems).toBe(1);
    expect(updated?.processedItems).toBe(2);

    const items = await db.query.transferItems.findMany({ where: eq(schema.transferItems.runId, runId) });
    const staleItem = items.find((item) => item.sourceKey === '51');
    expect(staleItem?.status).toBe('failed');
    expect(staleItem?.errorMessage).toMatch(/changed after preview/);
    // Only the stale page's write is skipped — the unaffected page still went through.
    expect(mocks.writeImportedPageWithHistory).toHaveBeenCalledTimes(1);
    expect(mocks.writeImportedPageWithHistory).toHaveBeenCalledWith(expect.objectContaining({ path: 'docs/history-fine' }));
  });

  it('marks the item as a WIKIJS_HISTORY_TRUNCATED warning when history exceeds the configured limit', async () => {
    const history: HistoryVersionDef[] = Array.from({ length: 5 }, (_, i) => ({
      versionId: i + 1,
      versionDate: `2026-01-0${i + 1}T00:00:00.000Z`,
      authorId: 1,
      authorName: 'A',
      actionType: 'edit',
      content: `# v${i + 1}`,
      title: `V${i + 1}`,
    }));
    const pages: PageDef[] = [{ id: 52, path: 'docs/history-truncated', locale: 'en', title: 'T', content: '# current', fingerprint: 'fp52', history }];
    const { runId } = await seedImport({ pages, includeHistory: true, historyLimit: 3 });

    await runTransferImport(runId);

    const updated = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, runId) });
    expect(updated?.status).toBe('completed_with_warnings');

    const items = await db.query.transferItems.findMany({ where: eq(schema.transferItems.runId, runId) });
    expect(items).toHaveLength(1);
    expect(items[0]?.warningCode).toBe('WIKIJS_HISTORY_TRUNCATED');
    const historyMeta = (items[0]?.metadata as { history?: { truncated: boolean; includedCount: number } }).history;
    expect(historyMeta?.truncated).toBe(true);
    expect(historyMeta?.includedCount).toBe(3);
  });

  it('does not fetch the history trail for a page targeted to be skipped', async () => {
    const pages: PageDef[] = [{
      id: 53,
      path: 'docs/history-skip-target',
      locale: 'en',
      title: 'T',
      content: '# current',
      fingerprint: 'fp53',
      action: 'skip',
      history: [
        { versionId: 1, versionDate: '2026-01-01T00:00:00.000Z', authorId: 1, authorName: 'A', actionType: 'initial', content: '# v1', title: 'V1' },
      ],
    }];
    const { runId } = await seedImport({ pages, includeHistory: true });

    await runTransferImport(runId);

    const clientInstance = mocks.WikiJsClient.mock.results.at(-1)!.value as { listHistory: ReturnType<typeof vi.fn> };
    expect(clientInstance.listHistory).not.toHaveBeenCalled();
    expect(mocks.writeImportedPageWithHistory).toHaveBeenCalledWith(expect.objectContaining({ action: 'skip' }));
  });
});
