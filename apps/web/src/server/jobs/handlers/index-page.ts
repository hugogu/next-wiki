import type { TaskPayload } from "@/server/jobs/task-service";

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
  _payload: TaskPayload<AiIngestPayload>,
): Promise<void> {
  // Implemented in Phase 6 — T048 AI knowledge service.
}
