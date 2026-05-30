import type { TaskPayload } from "@/server/jobs/task-service";
import { getActiveProvider, getProvider } from "@/server/services/ai/provider-service";
import { ingestPage } from "@/server/services/ai/knowledge-service";

export type SearchIndexPayload = {
  pageId: string;
  revisionId: string;
  locale: string;
};

export type AiIngestPayload = {
  pageId: string;
  revisionId: string;
  providerId: string;
};

// T027 wires these into the page-save hook. Implemented in Phase 3 (T019/T048).
export async function handleSearchIndexPage(
  _payload: TaskPayload<SearchIndexPayload>,
): Promise<void> {
  // Implemented in Phase 3 — T019 search index service.
}

export async function handleAiIngestPage(
  payload: TaskPayload<AiIngestPayload>,
): Promise<void> {
  const { pageId, revisionId } = payload.data;
  let { providerId } = payload.data;

  if (providerId === "default") {
    const active = await getActiveProvider();
    if (!active) {
      console.log(`[ai-ingest] no active provider — skipping page ${pageId}`);
      return;
    }
    providerId = active.id;
  }

  const record = await ingestPage({ pageId, revisionId, providerId });
  console.log(
    `[ai-ingest] page ${pageId} rev ${revisionId} ingested as knowledge record ${record.id} (status=${record.ingestionStatus})`,
  );
}
