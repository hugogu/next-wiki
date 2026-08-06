import { createHash } from 'node:crypto';
import { z } from 'zod';
import { fetchRemote } from './remote-fetch';
import { DomainError } from '@/server/errors';

const inventoryPageSchema = z.object({
  id: z.number().int(),
  path: z.string(),
  locale: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  contentType: z.string().nullable().optional(),
  isPublished: z.boolean(),
  isPrivate: z.boolean().optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

const sourcePageSchema = z.object({
  id: z.number().int(),
  path: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  content: z.string(),
  contentType: z.string().nullable().optional(),
  editor: z.string().nullable().optional(),
  locale: z.string(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  tags: z.array(z.union([z.string(), z.object({ tag: z.string(), title: z.string().optional() })])).optional(),
  authorName: z.string().nullable().optional(),
  creatorName: z.string().nullable().optional(),
});

const historyEntrySchema = z.object({
  versionId: z.number().int(),
  versionDate: z.string(),
  authorId: z.number().int(),
  authorName: z.string(),
  actionType: z.string(),
});

const historyResultSchema = z.object({
  trail: z.array(historyEntrySchema).nullable().optional(),
  total: z.number().int(),
});

const versionContentSchema = z.object({
  action: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  content: z.string(),
  contentType: z.string(),
  createdAt: z.string(),
  versionDate: z.string(),
  locale: z.string(),
  pageId: z.number().int(),
  path: z.string(),
  tags: z.array(z.string()).nullable().optional(),
  title: z.string(),
  versionId: z.number().int(),
});

const INVENTORY_QUERY = `query NextWikiPageInventory {
  pages { list(orderBy: ID, orderByDirection: ASC) {
    id path locale title description contentType isPublished isPrivate createdAt updatedAt tags
  } }
}`;
const SOURCE_QUERY = `query NextWikiPageSource($id: Int!) {
  pages { single(id: $id) {
    id path title description content contentType editor locale createdAt updatedAt
    tags { tag title } authorName creatorName
  } }
}`;
const HISTORY_QUERY = `query NextWikiPageHistory($id: Int!, $offsetPage: Int, $offsetSize: Int) {
  pages { history(id: $id, offsetPage: $offsetPage, offsetSize: $offsetSize) {
    trail { versionId versionDate authorId authorName actionType }
    total
  } }
}`;
const VERSION_QUERY = `query NextWikiPageVersion($pageId: Int!, $versionId: Int!) {
  pages { version(pageId: $pageId, versionId: $versionId) {
    action authorId authorName content contentType createdAt versionDate
    locale pageId path tags title versionId
  } }
}`;

export type WikiJsHistoryEntry = z.infer<typeof historyEntrySchema>;
export type WikiJsVersionContent = z.infer<typeof versionContentSchema>;

const HISTORY_PAGE_SIZE = 100;
const HISTORY_ACCESS_ERROR_PATTERN = /permission|forbidden|unauthorized|access denied/i;
export const DEFAULT_HISTORY_LIMIT = 300;
const MIN_HISTORY_LIMIT = 1;
const MAX_HISTORY_LIMIT = 2000;

/**
 * Coerce a persisted `run.options.historyLimit` value into the bounds the
 * wikijsTransferOptionsSchema enforces on write. Options are stored as
 * untyped jsonb, so a run created before this validation existed — or a row
 * edited by hand — could otherwise hand selectHistoryWindow() a 0 or NaN
 * limit and produce confusing truncation output.
 */
export function normalizeHistoryLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_HISTORY_LIMIT;
  return Math.min(MAX_HISTORY_LIMIT, Math.max(MIN_HISTORY_LIMIT, Math.floor(value)));
}

type WikiJsPageMetadata = {
  id: number;
  path: string;
  locale: string;
  title: string;
  contentType?: string | null;
  updatedAt?: string | null;
  tags?: WikiJsTagValue[];
};

type WikiJsTagValue = string | { tag: string; title?: string };

function wikiJsTagIdentifier(value: WikiJsTagValue): string {
  return (typeof value === 'string' ? value : value.tag).trim();
}

/** Convert Wiki.js tag resources into the labels next-wiki displays while
 * preserving the first spelling and removing blank/case-only duplicates. */
export function wikiJsTagNames(values: WikiJsTagValue[] | undefined): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const name = (typeof value === 'string' ? value : value.title || value.tag).trim();
    const normalized = name.toLocaleLowerCase();
    if (!name || seen.has(normalized)) continue;
    seen.add(normalized);
    names.push(name);
  }
  return names;
}

export function computeWikiJsPageFingerprint(page: WikiJsPageMetadata): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: page.id,
        path: page.path,
        locale: page.locale,
        title: page.title,
        contentType: page.contentType,
        updatedAt: page.updatedAt,
        tags: (page.tags ?? []).map(wikiJsTagIdentifier).filter(Boolean).map((tag) => tag.toLocaleLowerCase()).sort(),
      }),
    )
    .digest('hex');
}

export function computeWikiJsHistoryFingerprint(pageFingerprint: string, trail: WikiJsHistoryEntry[]): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        pageFingerprint,
        trail: trail.map((entry) => `${entry.versionId}:${entry.versionDate}`),
      }),
    )
    .digest('hex');
}

/**
 * Pick which historical versions to keep when a page's trail exceeds `limit`.
 * The current version always occupies one slot; when the trail itself must be
 * trimmed, the oldest entry is kept as the import's "starting point" version
 * even if it falls outside the most-recent window, so page history always
 * begins at a real Wiki.js version rather than an arbitrary cutoff.
 */
export function selectHistoryWindow(
  trail: WikiJsHistoryEntry[],
  limit: number,
): { keep: WikiJsHistoryEntry[]; truncated: boolean } {
  const totalAvailable = trail.length + 1; // +1 = current version, not part of trail
  if (totalAvailable <= limit) return { keep: trail, truncated: false };
  const budgetForTrail = Math.max(limit - 1, 0); // 1 slot reserved for the current version
  if (budgetForTrail === 0) return { keep: [], truncated: true };
  // Truncation only triggers once trail.length >= limit, which keeps
  // recentBudget (limit - 2) strictly below trail.length — so `recent` (the
  // most recent entries) can never already reach back to index 0.
  const recentBudget = Math.max(budgetForTrail - 1, 0); // 1 slot reserved for the oldest starting-point version
  const recent = recentBudget > 0 ? trail.slice(-recentBudget) : [];
  const keep = [trail[0]!, ...recent];
  return { keep, truncated: true };
}

export class WikiJsClient {
  constructor(
    readonly baseUrl: string,
    private readonly apiToken: string,
    private readonly allowPrivateNetwork: boolean,
  ) {}

  private async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const origin = new URL(this.baseUrl).origin;
    const url = `${this.baseUrl.replace(/\/$/, '')}/graphql`;

    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetchRemote({
          url,
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          method: 'POST',
          body: JSON.stringify({ query, variables }),
          maxBytes: 20 * 1024 * 1024,
          timeoutMs: 60_000,
          allowedPrivateOrigin: this.allowPrivateNetwork ? origin : undefined,
        });
        let body: { data?: T; errors?: { message?: string }[] };
        try {
          body = JSON.parse(response.bytes.toString('utf8'));
        } catch {
          throw new Error('Wiki.js returned invalid JSON');
        }
        if (body.errors?.length || !body.data) {
          throw new Error(body.errors?.[0]?.message ?? 'Wiki.js response is missing data');
        }
        return body.data;
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof DomainError &&
          (error.code === 'SOURCE_TIMEOUT' || error.code === 'SOURCE_UNAVAILABLE');
        if (!retryable || attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt));
      }
    }
    throw lastError;
  }

  async listPages() {
    const data = await this.query<{ pages: { list: unknown[] } }>(INVENTORY_QUERY);
    return z.array(inventoryPageSchema).parse(data.pages.list).filter((page) => page.isPublished);
  }

  async getPage(id: number) {
    const data = await this.query<{ pages: { single: unknown } }>(SOURCE_QUERY, { id });
    const page = sourcePageSchema.parse(data.pages.single);
    if (page.id !== id) throw new Error('Wiki.js returned an inconsistent page id');
    return {
      ...page,
      fingerprint: computeWikiJsPageFingerprint(page),
    };
  }

  /** Fetch a page's full revision trail (oldest to newest), paging through
   * Wiki.js's `history` query until `total` entries have been collected. */
  async listHistory(id: number): Promise<WikiJsHistoryEntry[]> {
    const trail: WikiJsHistoryEntry[] = [];
    // Wiki.js's `history` query is 0-indexed (confirmed against a live
    // instance: offsetPage:1 silently returns an empty trail with a nonzero
    // `total` whenever everything fits on the first page). Starting at 1
    // skipped every page's entire history without ever surfacing an error.
    for (let offsetPage = 0; ; offsetPage += 1) {
      const data = await this.query<{ pages: { history: unknown } }>(HISTORY_QUERY, {
        id,
        offsetPage,
        offsetSize: HISTORY_PAGE_SIZE,
      });
      const page = historyResultSchema.parse(data.pages.history);
      const entries = page.trail ?? [];
      trail.push(...entries);
      if (entries.length === 0 || trail.length >= page.total) break;
    }
    return trail.sort((a, b) => a.versionId - b.versionId);
  }

  async getVersion(pageId: number, versionId: number): Promise<WikiJsVersionContent> {
    const data = await this.query<{ pages: { version: unknown } }>(VERSION_QUERY, { pageId, versionId });
    return versionContentSchema.parse(data.pages.version);
  }

  /** Probe whether this source's API token can read page history. Throws a
   * `WIKIJS_HISTORY_FORBIDDEN` DomainError on a permission-shaped GraphQL
   * error so callers can fail the whole import up front rather than
   * discovering the gap page by page. Non-permission errors (network,
   * timeout, etc.) are rethrown unchanged for the existing retry/handling. */
  async assertHistoryAccess(probeId: number): Promise<void> {
    try {
      await this.query<{ pages: { history: unknown } }>(HISTORY_QUERY, {
        id: probeId,
        offsetPage: 0,
        offsetSize: 1,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (HISTORY_ACCESS_ERROR_PATTERN.test(message)) {
        throw new DomainError(
          'WIKIJS_HISTORY_FORBIDDEN',
          'Wiki.js API token is missing the read:history permission. Grant read:history to this token (or its group) in the Wiki.js admin panel, then retry.',
        );
      }
      throw error;
    }
  }
}
