/**
 * Server-only search subsystem boundary (017). Routes and `public-content.ts`
 * consume search through this module; individual engine adapters, SQL, and
 * provider details stay private to `./engines/*`.
 */
export {
  IMMEDIATE_CAPABILITY_IDS,
  SEARCH_CAPABILITY_IDS,
  isTerminalRunState,
  type CapabilitySnapshot,
  type SearchCandidate,
  type SearchEngine,
  type SearchEngineOutcome,
  type SearchEngineQuery,
} from './types';
export { createSearchEngineRegistry, productionSearchEngineRegistry, type SearchEngineRegistry } from './registry';
export {
  runCoordinatedSearch,
  type CoordinatedResultItem,
  type CoordinatedSearchInput,
  type CoordinatedSearchSnapshot,
} from './coordinator';
export { fuseCandidates, compareFusedCandidates, exactMatchTier, RRF_K, type EngineContribution, type FusedCandidate } from './ranking';
export {
  buildExcerpt,
  compactExcerpt,
  projectReadableCandidatePages,
  type ReadableCandidatePage,
} from './candidate-projection';
