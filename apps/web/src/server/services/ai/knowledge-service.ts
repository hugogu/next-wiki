import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { aiKnowledgeRecords, aiProviders } from "@/server/db/schema/ai";
import { pageRevisions } from "@/server/db/schema/wiki";
import { NotFoundError } from "@next-wiki/shared";
import { decryptCredentials } from "./provider-service";

export type KnowledgeRow = typeof aiKnowledgeRecords.$inferSelect;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripMarkdown(source: string): string {
  return (
    source
      // Code fences
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]*`/g, " ")
      // Headers
      .replace(/^#{1,6}\s+/gm, "")
      // Bold / italic
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
      .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
      // Links
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Images
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
      // Blockquotes
      .replace(/^>\s+/gm, "")
      // Horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, "")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

async function callEmbeddingApi(
  provider: typeof aiProviders.$inferSelect,
  credentials: Record<string, string>,
  text: string,
): Promise<string | null> {
  if (!provider.embeddingModel) return null;

  if (provider.providerType === "openai") {
    const apiKey = credentials["apiKey"] ?? "";
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: provider.embeddingModel, input: text }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    return JSON.stringify(json.data?.[0]?.embedding ?? []);
  }

  if (provider.providerType === "ollama") {
    const endpoint = provider.endpoint ?? "http://localhost:11434";
    const res = await fetch(`${endpoint}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: provider.embeddingModel, prompt: text }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { embedding?: number[] };
    return JSON.stringify(json.embedding ?? []);
  }

  // Anthropic has no embedding API
  return null;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getKnowledgeRecord(id: string): Promise<KnowledgeRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(aiKnowledgeRecords)
    .where(eq(aiKnowledgeRecords.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listKnowledgeRecordsForPage(pageId: string): Promise<KnowledgeRow[]> {
  const db = getDb();
  // Join through pageRevisions to find records for this page
  const revisionRows = await db
    .select({ id: pageRevisions.id })
    .from(pageRevisions)
    .where(eq(pageRevisions.pageId, pageId));

  if (revisionRows.length === 0) return [];

  const revisionIds = revisionRows.map((r) => r.id);
  return db
    .select()
    .from(aiKnowledgeRecords)
    .where(inArray(aiKnowledgeRecords.pageRevisionId, revisionIds));
}

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

export async function ingestPage(params: {
  pageId: string;
  revisionId: string;
  providerId: string;
}): Promise<KnowledgeRow> {
  const db = getDb();

  const revRows = await db
    .select({ sourceContent: pageRevisions.sourceContent })
    .from(pageRevisions)
    .where(eq(pageRevisions.id, params.revisionId))
    .limit(1);

  if (revRows.length === 0) throw new NotFoundError("PageRevision", params.revisionId);

  const summary = stripMarkdown(revRows[0].sourceContent);

  const providerRows = await db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.id, params.providerId))
    .limit(1);

  if (providerRows.length === 0) throw new NotFoundError("AiProvider", params.providerId);
  const provider = providerRows[0];

  // Upsert the knowledge record first so we have an id regardless of embedding outcome
  const existing = await db
    .select({ id: aiKnowledgeRecords.id })
    .from(aiKnowledgeRecords)
    .where(
      and(
        eq(aiKnowledgeRecords.pageRevisionId, params.revisionId),
        eq(aiKnowledgeRecords.providerId, params.providerId),
      ),
    )
    .limit(1);

  let record: KnowledgeRow;

  if (existing.length > 0) {
    const [updated] = await db
      .update(aiKnowledgeRecords)
      .set({
        summary,
        ingestionStatus: "ready",
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(aiKnowledgeRecords.id, existing[0].id))
      .returning();
    record = updated;
  } else {
    const [inserted] = await db
      .insert(aiKnowledgeRecords)
      .values({
        pageRevisionId: params.revisionId,
        providerId: params.providerId,
        summary,
        ingestionStatus: "ready",
      })
      .returning();
    record = inserted;
  }

  if (provider.embeddingModel) {
    try {
      const credentials = provider.encryptedCredentials
        ? decryptCredentials(provider.encryptedCredentials)
        : {};
      const embeddingRef = await callEmbeddingApi(provider, credentials, summary);
      if (embeddingRef !== null) {
        const [withEmbedding] = await db
          .update(aiKnowledgeRecords)
          .set({ embeddingRef, updatedAt: new Date() })
          .where(eq(aiKnowledgeRecords.id, record.id))
          .returning();
        record = withEmbedding;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const [failed] = await db
        .update(aiKnowledgeRecords)
        .set({ ingestionStatus: "failed", errorMessage, updatedAt: new Date() })
        .where(eq(aiKnowledgeRecords.id, record.id))
        .returning();
      record = failed;
    }
  }

  return record;
}

// ---------------------------------------------------------------------------
// Similarity search (keyword fallback — no pgvector in MVP)
// ---------------------------------------------------------------------------

export async function findSimilarChunks(params: {
  query: string;
  providerId: string;
  allowedPageIds: string[];
  limit?: number;
}): Promise<
  Array<{
    knowledgeId: string;
    pageId: string;
    revisionId: string;
    summary: string;
    score: number;
  }>
> {
  const limit = params.limit ?? 5;

  if (params.allowedPageIds.length === 0) return [];

  const db = getDb();

  // Resolve allowed page IDs to revision IDs
  const revisionRows = await db
    .select({ id: pageRevisions.id, pageId: pageRevisions.pageId })
    .from(pageRevisions)
    .where(inArray(pageRevisions.pageId, params.allowedPageIds));

  if (revisionRows.length === 0) return [];

  const allowedRevisionIds = revisionRows.map((r) => r.id);
  const revisionToPage = Object.fromEntries(revisionRows.map((r) => [r.id, r.pageId]));

  const rows = await db
    .select({
      id: aiKnowledgeRecords.id,
      pageRevisionId: aiKnowledgeRecords.pageRevisionId,
      summary: aiKnowledgeRecords.summary,
      rank: sql<number>`ts_rank(
        to_tsvector('english', coalesce(${aiKnowledgeRecords.summary}, '')),
        plainto_tsquery('english', ${params.query})
      )`,
    })
    .from(aiKnowledgeRecords)
    .where(
      and(
        eq(aiKnowledgeRecords.providerId, params.providerId),
        eq(aiKnowledgeRecords.ingestionStatus, "ready"),
        inArray(aiKnowledgeRecords.pageRevisionId, allowedRevisionIds),
      ),
    )
    .orderBy(
      sql`ts_rank(
        to_tsvector('english', coalesce(${aiKnowledgeRecords.summary}, '')),
        plainto_tsquery('english', ${params.query})
      ) DESC`,
    )
    .limit(limit);

  return rows.map((r) => ({
    knowledgeId: r.id,
    pageId: revisionToPage[r.pageRevisionId] ?? "",
    revisionId: r.pageRevisionId,
    summary: r.summary ?? "",
    score: r.rank,
  }));
}
