import { enqueueTask } from "@/server/jobs/task-service";
import { JOB_TYPES } from "@/server/jobs/worker";
import type { PermissionContext } from "@/server/services/permissions/context";

export type SavePageHookParams = {
  pageId: string;
  revisionId: string;
  spaceKey: string;
  locale: string;
  sourceContent: string;
  actor: PermissionContext;
};

/**
 * Run all post-save hooks after a page revision is committed.
 * Called by page-service after createPage or updatePage.
 *
 * Hooks (all async/fire-and-forget via pg-boss):
 * 1. Full-text search re-indexing
 * 2. AI knowledge ingestion (if AI enabled)
 * 3. Outbound link extraction and validation
 */
export async function runPageSaveHooks(params: SavePageHookParams): Promise<void> {
  const { pageId, revisionId, locale, actor } = params;

  // 1. Enqueue search index job (always).
  await enqueueTask(JOB_TYPES.SEARCH_INDEX_PAGE, {
    requestedByUserId: actor.userId,
    resourceType: "page",
    resourceId: pageId,
    data: { pageId, revisionId, locale },
  });

  // 2. AI ingestion (conditional — only if AI is enabled).
  const { isAiEnabled } = await import("@/server/config/env");
  if (isAiEnabled) {
    await enqueueTask(JOB_TYPES.AI_INGEST_PAGE, {
      requestedByUserId: actor.userId,
      resourceType: "page",
      resourceId: pageId,
      data: { pageId, revisionId, providerId: "default" },
    }).catch(() => {
      // Non-fatal: AI ingestion failure must not block page saves.
    });
  }

  // 3. Link extraction runs inline (lightweight parse, not a heavy job).
  // Defer to avoid blocking the response — link status is eventually consistent.
  setImmediate(() => {
    extractAndStoreLinks(pageId, revisionId, params.sourceContent, params.spaceKey).catch(
      (err) => {
        console.warn("[save-page] Link extraction failed:", err);
      },
    );
  });
}

async function extractAndStoreLinks(
  pageId: string,
  revisionId: string,
  sourceContent: string,
  currentSpaceKey: string,
): Promise<void> {
  // Extract markdown links: [text](href)
  const linkPattern = /\[([^\]]*)\]\(([^)]+)\)/g;
  const internalLinks: Array<{
    targetSpaceKey: string;
    targetPath: string;
    targetLocale?: string;
    linkText?: string;
  }> = [];

  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(sourceContent)) !== null) {
    const [, text, href] = match;
    if (!href) continue;

    // Internal link: starts with / or is relative (no protocol)
    const isInternal = href.startsWith("/") && !href.startsWith("//");
    if (!isInternal) continue;

    const segments = href.split("/").filter(Boolean);
    if (segments.length < 2) continue;

    const [spaceKey, ...pathParts] = segments;
    const path = "/" + pathParts.join("/");

    internalLinks.push({
      targetSpaceKey: spaceKey ?? currentSpaceKey,
      targetPath: path,
      linkText: text ?? undefined,
    });
  }

  if (internalLinks.length === 0) return;

  const { upsertPageLinks } = await import("@/server/services/wiki/link-service");
  await upsertPageLinks(pageId, revisionId, internalLinks);
}
