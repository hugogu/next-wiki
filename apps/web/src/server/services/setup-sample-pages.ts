import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type {
  SetupSamplePageResult,
  SetupSamplePagesResponse,
  SetupSamplePagesStatus,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import type { Actor, PermCtx } from '@/server/permissions';
import * as pagesService from '@/server/services/pages';
import * as revisionsService from '@/server/services/revisions';
import { DomainError } from '@/server/errors';
import { assertSetupAdmin, recordSamplePagesOutcome, recordSamplePagesSkip } from '@/server/services/setup';
import {
  AGENT_MEMORY_PAGE_SOURCE,
  AGENT_MEMORY_PAGE_TITLE,
  LEGACY_AGENT_MEMORY_PAGE_PATH,
  MAIN_FEATURES_PAGE_SOURCE,
  MAIN_FEATURES_PAGE_TITLE,
  MARKDOWN_SYNTAX_PAGE_SOURCE,
  MARKDOWN_SYNTAX_PAGE_TITLE,
  ONBOARDING_LINKS_MARKER,
  ONBOARDING_WELCOME_LINKS_BLOCK,
  ONBOARDING_WELCOME_PAGE_SOURCE,
  OPENCLAW_PAGE_SOURCE,
  OPENCLAW_PAGE_TITLE,
  SAMPLE_PAGE_MARKER,
  SAMPLE_PAGE_PATHS,
  WELCOME_PAGE_TITLE,
} from '@/server/services/setup-sample-page-definitions';
import { getSpaceById, resolveSpace } from '@/server/services/spaces';

function asCtx(actor: Actor): PermCtx {
  return { actor };
}

/** Decline the optional sample/help pages. Idempotent and side-effect free. */
export async function skipSamplePages(actor: Actor): Promise<SetupSamplePagesResponse> {
  const progress = await assertSetupAdmin(actor);
  if (progress.currentStep !== 'sample_pages' && progress.currentStep !== 'summary') {
    throw new DomainError('BAD_REQUEST', 'Select a writing mode before configuring sample pages');
  }
  await recordSamplePagesSkip();
  return { status: 'skipped', pages: [], nextStep: 'summary' };
}

async function findPage(path: string) {
  const defaultSpace = await resolveSpace();
  if (!defaultSpace) return null;
  return db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, defaultSpace.id),
      eq(schema.pages.path, path),
      isNull(schema.pages.deletedAt),
      isNull(schema.pages.translationGroupId),
    ),
  });
}

async function findDeletedPage(path: string) {
  const defaultSpace = await resolveSpace();
  if (!defaultSpace) return null;
  return db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, defaultSpace.id),
      eq(schema.pages.path, path),
      isNotNull(schema.pages.deletedAt),
      isNull(schema.pages.translationGroupId),
    ),
  });
}

type SamplePageRow = NonNullable<Awaited<ReturnType<typeof findPage>>>;

/**
 * A page can be edited after setup, so only checking its current revision is
 * not enough to identify a managed example. The surviving revision history is
 * the durable ownership marker for an explicit admin reinitialization.
 */
async function isManagedSamplePage(page: SamplePageRow): Promise<boolean> {
  const revisions = await db.query.pageRevisions.findMany({
    where: and(eq(schema.pageRevisions.pageId, page.id), isNull(schema.pageRevisions.deletedAt)),
    columns: { contentSource: true },
  });
  return revisions.some((revision) => revision.contentSource?.includes(SAMPLE_PAGE_MARKER));
}

async function findOrRestorePage(
  ctx: PermCtx,
  path: string,
  refreshManaged: boolean,
): Promise<{ page: SamplePageRow | null; restored: boolean; collision: boolean }> {
  const existing = await findPage(path);
  if (existing) return { page: existing, restored: false, collision: false };

  const deleted = await findDeletedPage(path);
  if (!deleted) return { page: null, restored: false, collision: false };
  if (!refreshManaged || !(await isManagedSamplePage(deleted))) {
    return { page: null, restored: false, collision: true };
  }

  await pagesService.restoreDeletedPage(ctx, path);
  const restored = await findPage(path);
  if (!restored) throw new Error(`Restored sample page ${path} is not readable`);
  return { page: restored, restored: true, collision: false };
}

async function publishedSource(pageId: string, publishedVersionId: string | null): Promise<string | null> {
  if (!publishedVersionId) return null;
  const revision = await db.query.pageRevisions.findFirst({
    where: and(eq(schema.pageRevisions.id, publishedVersionId), eq(schema.pageRevisions.pageId, pageId)),
  });
  return revision?.contentSource ?? null;
}

async function createPublishedPage(
  ctx: PermCtx,
  input: { path: string; title: string; contentSource: string },
): Promise<string> {
  const { pageId } = await pagesService.create(ctx, input);
  await revisionsService.publish(ctx, { path: input.path, version: 1 });
  return pageId;
}

/**
 * Enrich an existing welcome page with links to the help pages as a new
 * published revision. Idempotent: a welcome already carrying the onboarding
 * links block is left untouched.
 */
async function enrichWelcomePage(
  ctx: PermCtx,
  page: { id: string; path: string; title: string; currentPublishedVersionId: string | null },
  refreshManaged: boolean,
  restoredDeleted: boolean,
): Promise<SetupSamplePageResult> {
  const source = await publishedSource(page.id, page.currentPublishedVersionId);
  if (source?.includes(ONBOARDING_LINKS_MARKER)) {
    // The welcome page may contain user-authored content before the managed
    // links block. Refresh only that block when Admin explicitly reinitializes
    // examples; a normal first-run retry remains idempotent.
    if (!refreshManaged || (!source.includes(SAMPLE_PAGE_MARKER) && !restoredDeleted)) {
      return { path: page.path, status: 'skipped', pageId: page.id };
    }
    const markerIndex = source.indexOf(ONBOARDING_LINKS_MARKER);
    const base = source.slice(0, markerIndex).trimEnd();
    const refreshed = `${base}\n${ONBOARDING_WELCOME_LINKS_BLOCK}`;
    if (refreshed === source && !restoredDeleted) return { path: page.path, status: 'skipped', pageId: page.id };
    const { versionNumber } = await pagesService.newDraft(ctx, page.path, {
      title: page.title,
      contentSource: refreshed,
    });
    await revisionsService.publish(ctx, { path: page.path, version: versionNumber });
    return { path: page.path, status: 'updated', pageId: page.id };
  }
  const base = source ?? `# ${page.title}\n`;
  const enriched = `${base.trimEnd()}\n${ONBOARDING_WELCOME_LINKS_BLOCK}`;
  const { versionNumber } = await pagesService.newDraft(ctx, page.path, {
    title: page.title,
    contentSource: enriched,
  });
  await revisionsService.publish(ctx, { path: page.path, version: versionNumber });
  return { path: page.path, status: 'updated', pageId: page.id };
}

async function writeSamplePage(
  ctx: PermCtx,
  input: { path: string; title: string; contentSource: string; legacyPath?: string },
  refreshManaged: boolean,
): Promise<SetupSamplePageResult> {
  let existing = await findPage(input.path);
  let movedLegacy = false;
  let restoredDeleted = false;
  if (!existing && input.legacyPath) {
    const legacy = await findPage(input.legacyPath);
    const legacySource = legacy
      ? await publishedSource(legacy.id, legacy.currentPublishedVersionId)
      : null;
    if (legacy && legacySource?.includes(SAMPLE_PAGE_MARKER)) {
      // Preserve existing installs without leaving a duplicate setup-owned
      // guide behind. Updating both tree path and public slug retains the old
      // address as a redirect while making the integrations folder canonical.
      // User-authored legacy pages are never moved.
      await pagesService.updateProperties(ctx, legacy.path, {
        path: input.path,
        slug: input.path,
      });
      existing = await findPage(input.path);
      movedLegacy = true;
    }
  }
  if (!existing) {
    const restored = await findOrRestorePage(ctx, input.path, refreshManaged);
    existing = restored.page;
    restoredDeleted = restored.restored;
    if (restored.collision) {
      return { path: input.path, status: 'collision', reason: 'A deleted page already reserves this path' };
    }
  }
  if (!existing) {
    const pageId = await createPublishedPage(ctx, input);
    return { path: input.path, status: 'created', pageId };
  }
  const source = await publishedSource(existing.id, existing.currentPublishedVersionId);
  if (restoredDeleted || source?.includes(SAMPLE_PAGE_MARKER)) {
    if (refreshManaged && (restoredDeleted || source !== input.contentSource)) {
      const { versionNumber } = await pagesService.newDraft(ctx, input.path, {
        title: input.title,
        contentSource: input.contentSource,
      });
      await revisionsService.publish(ctx, { path: input.path, version: versionNumber });
      return { path: input.path, status: 'updated', pageId: existing.id };
    }
    return { path: input.path, status: movedLegacy || restoredDeleted ? 'updated' : 'skipped', pageId: existing.id };
  }
  // A user-authored page at a canonical sample path is never overwritten.
  return { path: input.path, status: 'collision', reason: 'A user-authored page already exists at this path' };
}

/**
 * Generate the optional welcome/markdown-syntax/main-features/Hermes integration pages through
 * the canonical page services (published revisions, normal permissions, and
 * public content cache invalidation via publish). Idempotent per page: reruns
 * skip setup-owned pages and report collisions for user-authored ones.
 */
export async function generateSamplePages(actor: Actor): Promise<SetupSamplePagesResponse> {
  const progress = await assertSetupAdmin(actor);
  if (progress.currentStep !== 'sample_pages' && progress.currentStep !== 'summary') {
    throw new DomainError('BAD_REQUEST', 'Select a writing mode before configuring sample pages');
  }
  return generateSamplePagesInternal(actor, true, false);
}

function assertAdmin(actor: Actor): void {
  if (actor.kind !== 'user' || actor.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'You do not have permission to initialize sample pages');
  }
}

/**
 * Re-run managed sample-page initialization from Admin → Spaces after
 * first-run setup has closed. Only the built-in Wiki space is valid; missing
 * or soft-deleted marker-owned pages are restored, current marker-owned pages
 * are refreshed, and user-authored collisions are left untouched.
 */
export async function reinitializeSamplePages(actor: Actor, spaceId: string): Promise<SetupSamplePagesResponse> {
  assertAdmin(actor);
  const [space, wikiSpace] = await Promise.all([getSpaceById(spaceId), resolveSpace()]);
  if (!space) throw new DomainError('NOT_FOUND', 'Space not found');
  if (space.kind !== 'wiki' || !wikiSpace || space.id !== wikiSpace.id) {
    throw new DomainError('BAD_REQUEST', 'Sample pages can only be initialized for the Wiki space');
  }
  return generateSamplePagesInternal(actor, false, true);
}

async function generateSamplePagesInternal(
  actor: Actor,
  recordSetupProgress: boolean,
  refreshManaged: boolean,
): Promise<SetupSamplePagesResponse> {
  const ctx = asCtx(actor);

  const results: SetupSamplePageResult[] = [];

  try {
    const welcome = await findOrRestorePage(ctx, SAMPLE_PAGE_PATHS.welcome, refreshManaged);
    if (welcome.collision) {
      results.push({ path: SAMPLE_PAGE_PATHS.welcome, status: 'collision', reason: 'A deleted page already reserves this path' });
    } else if (welcome.page) {
      results.push(await enrichWelcomePage(ctx, welcome.page, refreshManaged, welcome.restored));
    } else {
      results.push({
        path: SAMPLE_PAGE_PATHS.welcome,
        status: 'created',
        pageId: await createPublishedPage(ctx, {
          path: SAMPLE_PAGE_PATHS.welcome,
          title: WELCOME_PAGE_TITLE,
          contentSource: ONBOARDING_WELCOME_PAGE_SOURCE,
        }),
      });
    }
  } catch (error) {
    results.push({
      path: SAMPLE_PAGE_PATHS.welcome,
      status: 'failed',
      reason: error instanceof Error ? error.message : 'Page generation failed',
    });
  }

  for (const definition of [
    { path: SAMPLE_PAGE_PATHS.markdownSyntax, title: MARKDOWN_SYNTAX_PAGE_TITLE, contentSource: MARKDOWN_SYNTAX_PAGE_SOURCE },
    { path: SAMPLE_PAGE_PATHS.mainFeatures, title: MAIN_FEATURES_PAGE_TITLE, contentSource: MAIN_FEATURES_PAGE_SOURCE },
    {
      path: SAMPLE_PAGE_PATHS.agentMemory,
      title: AGENT_MEMORY_PAGE_TITLE,
      contentSource: AGENT_MEMORY_PAGE_SOURCE,
      legacyPath: LEGACY_AGENT_MEMORY_PAGE_PATH,
    },
    { path: SAMPLE_PAGE_PATHS.openclaw, title: OPENCLAW_PAGE_TITLE, contentSource: OPENCLAW_PAGE_SOURCE },
  ]) {
    try {
      results.push(await writeSamplePage(ctx, definition, refreshManaged));
    } catch (error) {
      results.push({
        path: definition.path,
        status: 'failed',
        reason: error instanceof Error ? error.message : 'Page generation failed',
      });
    }
  }

  const succeeded = results.filter((result) => ['created', 'updated', 'skipped'].includes(result.status)).length;
  const status: Extract<SetupSamplePagesStatus, 'completed' | 'partial' | 'failed'> =
    succeeded === results.length ? 'completed' : succeeded > 0 ? 'partial' : 'failed';
  if (recordSetupProgress) await recordSamplePagesOutcome(status, results);
  return { status, pages: results, nextStep: 'summary' };
}
