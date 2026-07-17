import { and, eq, isNull } from 'drizzle-orm';
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
import { assertSetupAdmin, recordSamplePagesOutcome, recordSamplePagesSkip } from '@/server/services/setup';
import {
  MAIN_FEATURES_PAGE_SOURCE,
  MAIN_FEATURES_PAGE_TITLE,
  MARKDOWN_SYNTAX_PAGE_SOURCE,
  MARKDOWN_SYNTAX_PAGE_TITLE,
  ONBOARDING_LINKS_MARKER,
  ONBOARDING_WELCOME_LINKS_BLOCK,
  ONBOARDING_WELCOME_PAGE_SOURCE,
  SAMPLE_PAGE_MARKER,
  SAMPLE_PAGE_PATHS,
  WELCOME_PAGE_TITLE,
} from '@/server/services/setup-sample-page-definitions';

function asCtx(actor: Actor): PermCtx {
  return { actor };
}

/** Decline the optional sample/help pages. Idempotent and side-effect free. */
export async function skipSamplePages(actor: Actor): Promise<SetupSamplePagesResponse> {
  await assertSetupAdmin(actor);
  await recordSamplePagesSkip();
  return { status: 'skipped', pages: [], nextStep: 'summary' };
}

async function findPage(path: string) {
  return db.query.pages.findFirst({
    where: and(
      eq(schema.pages.path, path),
      isNull(schema.pages.deletedAt),
      isNull(schema.pages.translationGroupId),
    ),
  });
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
): Promise<SetupSamplePageResult> {
  const source = await publishedSource(page.id, page.currentPublishedVersionId);
  if (source?.includes(ONBOARDING_LINKS_MARKER)) {
    return { path: page.path, status: 'skipped', pageId: page.id };
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
  input: { path: string; title: string; contentSource: string },
): Promise<SetupSamplePageResult> {
  const existing = await findPage(input.path);
  if (!existing) {
    const pageId = await createPublishedPage(ctx, input);
    return { path: input.path, status: 'created', pageId };
  }
  const source = await publishedSource(existing.id, existing.currentPublishedVersionId);
  if (source?.includes(SAMPLE_PAGE_MARKER)) {
    return { path: input.path, status: 'skipped', pageId: existing.id };
  }
  // A user-authored page at a canonical sample path is never overwritten.
  return { path: input.path, status: 'collision', reason: 'A user-authored page already exists at this path' };
}

/**
 * Generate the optional welcome/markdown-syntax/main-features pages through
 * the canonical page services (published revisions, normal permissions, and
 * public content cache invalidation via publish). Idempotent per page: reruns
 * skip setup-owned pages and report collisions for user-authored ones.
 */
export async function generateSamplePages(actor: Actor): Promise<SetupSamplePagesResponse> {
  await assertSetupAdmin(actor);
  const ctx = asCtx(actor);

  const results: SetupSamplePageResult[] = [];

  try {
    const welcome = await findPage(SAMPLE_PAGE_PATHS.welcome);
    results.push(
      welcome
        ? await enrichWelcomePage(ctx, welcome)
        : {
            path: SAMPLE_PAGE_PATHS.welcome,
            status: 'created',
            pageId: await createPublishedPage(ctx, {
              path: SAMPLE_PAGE_PATHS.welcome,
              title: WELCOME_PAGE_TITLE,
              contentSource: ONBOARDING_WELCOME_PAGE_SOURCE,
            }),
          },
    );
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
  ]) {
    try {
      results.push(await writeSamplePage(ctx, definition));
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
  await recordSamplePagesOutcome(status, results);
  return { status, pages: results, nextStep: 'summary' };
}
