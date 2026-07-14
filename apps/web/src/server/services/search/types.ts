import type { SearchCapabilityId, SearchEngineRunState } from '@next-wiki/shared';
import type { PermCtx } from '@/server/permissions';

/** Stable product capability identifiers. Never a database extension or vendor name. */
export const SEARCH_CAPABILITY_IDS = ['full_text', 'fuzzy', 'semantic'] as const satisfies readonly SearchCapabilityId[];

/** Capabilities answered inside the request budget (no asynchronous continuation). */
export const IMMEDIATE_CAPABILITY_IDS = ['full_text', 'fuzzy'] as const satisfies readonly SearchCapabilityId[];

/**
 * Per-request budget for immediate engines. Lexical PostgreSQL queries must
 * return the initial snapshot well within the 500 ms product goal (SC-003).
 */
export const IMMEDIATE_ENGINE_DEADLINE_MS = 400;

/** Enabled-capability set accepted when a search attempt was created. */
export type CapabilitySnapshot = Record<SearchCapabilityId, boolean>;

export type SearchEngineQuery = {
  /** Normalized (trimmed) query shared by every enabled capability. */
  q: string;
  /** Maximum candidates one engine may contribute before fusion. */
  limit: number;
  /** Soft budget in milliseconds; an engine exceeding it reports timed_out. */
  deadlineMs: number;
  /** Durable attempt identity for engines that can resume asynchronous work. */
  attempt?: {
    searchRecordId: string;
    /** Opaque server-only continuation from a previous run of this attempt. */
    continuationRef: string | null;
  };
};

/**
 * Internal candidate reference. It is never an API response shape: every
 * candidate passes the central visibility projection before any page field,
 * excerpt, count, or fused result is produced.
 */
export type SearchCandidate = {
  pageId: string;
  revisionId?: string;
  /** Engine-local 0-based rank. Native scores are never compared across engines. */
  rank: number;
  /** Optional raw-source excerpt evidence; re-validated against readable content. */
  excerpt?: string | null;
  /** Deterministic exact-match evidence used for ranking protection. */
  exact?: {
    path?: boolean;
    title?: boolean;
    term?: boolean;
  };
};

export type SearchEngineOutcome =
  | { state: 'ready'; candidates: SearchCandidate[]; continuationRef?: string | null }
  | { state: 'pending'; continuationRef: string | null }
  | { state: 'unavailable' }
  | { state: 'failed' }
  | { state: 'timed_out' };

/**
 * Common capability contract. Adapters return only internal candidates and a
 * stable lifecycle state — no SQL, vector, provider, or raw-score field. The
 * coordinator owns enablement, concurrency, permission-safe hydration,
 * fusion, and response projection.
 */
export interface SearchEngine {
  readonly capability: SearchCapabilityId;
  run(ctx: PermCtx, query: SearchEngineQuery): Promise<SearchEngineOutcome>;
}

/** States that end a run; `pending` is the only resumable state. */
export const TERMINAL_RUN_STATES = ['ready', 'skipped', 'unavailable', 'failed', 'timed_out'] as const satisfies readonly SearchEngineRunState[];

export function isTerminalRunState(state: SearchEngineRunState): boolean {
  return state !== 'pending';
}
