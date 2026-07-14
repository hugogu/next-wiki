/**
 * Server-only search subsystem boundary (017). Routes and `public-content.ts`
 * consume search through this module; individual engine adapters, SQL, and
 * provider details stay private to `./engines/*`.
 */
export {
  IMMEDIATE_CAPABILITY_IDS,
  IMMEDIATE_ENGINE_DEADLINE_MS,
  SEARCH_CAPABILITY_IDS,
  isTerminalRunState,
  type CapabilitySnapshot,
  type SearchCandidate,
  type SearchEngine,
  type SearchEngineOutcome,
  type SearchEngineQuery,
} from './types';
export { createSearchEngineRegistry, type SearchEngineRegistry } from './registry';
export {
  buildExcerpt,
  compactExcerpt,
  projectReadableCandidatePages,
  type ReadableCandidatePage,
} from './candidate-projection';
