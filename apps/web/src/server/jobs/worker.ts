import { startBoss } from "./boss";
import { registerHandler } from "./task-service";

// Job type constants — used by producers and consumers.
export const JOB_TYPES = {
  SEARCH_INDEX_PAGE: "search.index-page",
  AI_INGEST_PAGE: "ai.ingest-page",
  AI_REBUILD_INDEX: "ai.rebuild-index",
  PAGE_RESTORE: "page.restore",
  BULK_IMPORT: "bulk.import",
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

/**
 * Bootstrap the background worker.
 * Imports and registers all job handlers. Called once at server startup
 * (in a standalone worker process or the Next.js server initialization).
 */
export async function bootstrapWorker(): Promise<void> {
  await startBoss();

  // Lazily import handlers to avoid circular deps during schema bootstrap.
  const { handleSearchIndexPage } = await import("./handlers/index-page");
  await registerHandler(JOB_TYPES.SEARCH_INDEX_PAGE, handleSearchIndexPage);

  // AI ingest handler — only registers if AI is enabled.
  const { isAiEnabled } = await import("@/server/config/env");
  if (isAiEnabled) {
    const { handleAiIngestPage } = await import("./handlers/index-page");
    await registerHandler(JOB_TYPES.AI_INGEST_PAGE, handleAiIngestPage);
  }

  console.info("[worker] Background job worker started");
}
