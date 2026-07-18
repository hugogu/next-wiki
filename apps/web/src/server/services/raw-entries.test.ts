import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import * as pageService from '@/server/services/pages';
import * as publicContent from '@/server/services/public-content';
import * as rawEntries from '@/server/services/raw-entries';
import * as revisions from '@/server/services/revisions';
import { beginPendingSwitch, clearPendingSwitch, setModeInternal } from '@/server/services/writing-mode';
import { createAdminUser, resetSetupOnboardingState } from '../../../test/setup-onboarding-fixtures';

async function ensureRawSpace() {
  const [space] = await db
    .insert(schema.spaces)
    .values({ slug: 'raw', name: 'Raw', kind: 'raw', anonymousRead: false })
    .onConflictDoNothing()
    .returning();
  return space ?? await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'raw') });
}

async function createUser(email: string, role: 'editor' | 'reader') {
  const [user] = await db
    .insert(schema.users)
    .values({ email, passwordHash: 'HASH', role, status: 'active' })
    .returning();
  if (!user) throw new Error('Failed to create test user');
  return user;
}

async function createRawEntry(
  ctx: ReturnType<typeof buildUserCtx>,
  path = 'raw/evidence',
  content = 'Initial transcript chunk.',
) {
  return rawEntries.createEntry(ctx, {
    path,
    title: 'Evidence',
    inputKind: 'chat-transcript',
    source: {
      channel: 'support',
      sessionId: 'session-1',
      occurredAt: '2026-07-18T08:00:00.000Z',
    },
    content,
  });
}

describe('raw entries service', () => {
  beforeEach(async () => {
    await resetSetupOnboardingState();
    await ensureRawSpace();
    await setModeInternal('llm-wiki', null);
  });

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  it('creates an original, restricted, auto-published entry with OKF source metadata', async () => {
    const { userId } = await createAdminUser();
    const ctx = buildUserCtx(userId, 'admin');
    const created = await createRawEntry(ctx, 'raw/evidence', 'Initial transcript chunk.\n');

    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, created.pageId) });
    const revision = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, created.versionId) });

    expect(page).toMatchObject({ path: 'raw/evidence', nature: 'original', visibility: 'restricted' });
    expect(page?.latestVersionId).toBe(created.versionId);
    expect(page?.currentPublishedVersionId).toBe(created.versionId);
    expect(revision).toMatchObject({ versionNumber: 1, status: 'published', sourceMetadata: {
      channel: 'support', sessionId: 'session-1', occurredAt: '2026-07-18T08:00:00.000Z',
    } });
    expect(revision?.contentSource).toContain('type: chat-transcript');
    expect(revision?.contentSource).toContain('channel: support');
    expect(revision?.contentSource).toContain('sessionId: session-1');
    expect(revision?.contentSource).not.toContain('source:\n');

    const resource = await publicContent.getRevision(ctx, created.pageId, 1);
    expect(resource).toMatchObject({
      status: 'published',
      origin: { actorKind: 'human', nature: 'original' },
      source: { channel: 'support', sessionId: 'session-1' },
    });
  });

  it('appends a new published revision without changing previous bytes', async () => {
    const { userId } = await createAdminUser();
    const ctx = buildUserCtx(userId, 'admin');
    const created = await createRawEntry(ctx, 'raw/evidence', 'Initial transcript chunk.\n');
    const initial = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, created.versionId) });
    if (!initial?.contentSource) throw new Error('Missing initial raw source');

    const appended = await rawEntries.appendEntry(ctx, created.pageId, {
      content: '\nFollow-up transcript chunk.',
      source: { channel: 'support', sessionId: 'session-1', occurredAt: '2026-07-18T09:00:00.000Z' },
    });
    const revisionsByVersion = await db
      .select()
      .from(schema.pageRevisions)
      .where(eq(schema.pageRevisions.pageId, created.pageId))
      .orderBy(asc(schema.pageRevisions.versionNumber));

    expect(appended.versionNumber).toBe(2);
    expect(revisionsByVersion).toHaveLength(2);
    expect(revisionsByVersion[0]?.contentSource).toBe(initial.contentSource);
    expect(revisionsByVersion[1]).toMatchObject({ status: 'published', sourceMetadata: {
      channel: 'support', sessionId: 'session-1', occurredAt: '2026-07-18T09:00:00.000Z',
    } });
    expect(revisionsByVersion[1]?.contentSource).toBe(`${initial.contentSource}\n\n---\n\n\nFollow-up transcript chunk.`);
  });

  it('serializes concurrent appends into sequential versions', async () => {
    const { userId } = await createAdminUser();
    const ctx = buildUserCtx(userId, 'admin');
    const created = await createRawEntry(ctx);

    const [first, second] = await Promise.all([
      rawEntries.appendEntry(ctx, created.pageId, { content: 'Concurrent chunk A.' }),
      rawEntries.appendEntry(ctx, created.pageId, { content: 'Concurrent chunk B.' }),
    ]);
    const rows = await db
      .select()
      .from(schema.pageRevisions)
      .where(eq(schema.pageRevisions.pageId, created.pageId))
      .orderBy(asc(schema.pageRevisions.versionNumber));

    expect(new Set([first.versionNumber, second.versionNumber])).toEqual(new Set([2, 3]));
    expect(rows.map((row) => row.versionNumber)).toEqual([1, 2, 3]);
    expect(rows[2]?.contentSource).toContain('Concurrent chunk A.');
    expect(rows[2]?.contentSource).toContain('Concurrent chunk B.');
  });

  it('rejects every regular mutation path for raw entries', async () => {
    const { userId } = await createAdminUser();
    const ctx = buildUserCtx(userId, 'admin');
    const created = await createRawEntry(ctx);

    await expect(pageService.newDraft(ctx, 'raw/evidence', { title: 'Changed', contentSource: 'Changed' }, 'raw')).rejects.toMatchObject({ code: 'RAW_SPACE_IMMUTABLE' });
    await expect(pageService.updateProperties(ctx, 'raw/evidence', { path: 'raw/renamed' }, 'raw')).rejects.toMatchObject({ code: 'RAW_SPACE_IMMUTABLE' });
    await expect(pageService.remove(ctx, 'raw/evidence', 'raw')).rejects.toMatchObject({ code: 'RAW_SPACE_IMMUTABLE' });
    await expect(revisions.publish(ctx, { path: 'raw/evidence', version: 1, space: 'raw' })).rejects.toMatchObject({ code: 'RAW_SPACE_IMMUTABLE' });
    await expect(publicContent.updatePageMetadata(ctx, created.pageId, { baseRevisionId: created.versionId, title: 'Changed' })).rejects.toMatchObject({ code: 'RAW_SPACE_IMMUTABLE' });
  });

  it('denies non-admin API keys while allowing an admin-backed key', async () => {
    const { userId } = await createAdminUser();
    const editor = await createUser('raw-editor@example.com', 'editor');
    const reader = await createUser('raw-reader@example.com', 'reader');
    const input = { path: 'raw/api-key', title: 'API Key', inputKind: 'manual-note', content: 'A note.' };

    await expect(rawEntries.createEntry(buildApiKeyCtx(editor.id, 'editor', ['create'], 'editor-key'), input)).rejects.toMatchObject({ code: 'SPACE_FORBIDDEN' });
    await expect(rawEntries.createEntry(buildApiKeyCtx(reader.id, 'reader', ['create'], 'reader-key'), input)).rejects.toMatchObject({ code: 'SPACE_FORBIDDEN' });
    await expect(rawEntries.createEntry(buildApiKeyCtx(userId, 'admin', ['create'], 'admin-key'), input)).resolves.toMatchObject({ pageId: expect.any(String) });
  });

  it('rejects raw writes outside LLM Wiki mode and while a switch is pending', async () => {
    const { userId } = await createAdminUser();
    const ctx = buildUserCtx(userId, 'admin');
    await setModeInternal('copilot', userId);
    await expect(createRawEntry(ctx, 'raw/copilot')).rejects.toMatchObject({ code: 'SPACE_UNAVAILABLE' });

    await setModeInternal('llm-wiki', userId);
    await beginPendingSwitch('copilot', randomUUID(), userId);
    await expect(createRawEntry(ctx, 'raw/pending')).rejects.toMatchObject({ code: 'MODE_SWITCH_IN_PROGRESS' });
    await clearPendingSwitch(userId);
  });
});
