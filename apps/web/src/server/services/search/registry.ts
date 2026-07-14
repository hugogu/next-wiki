import type { SearchCapabilityId } from '@next-wiki/shared';
import { createSemanticEngine } from './engines/pgvector-semantic';
import { createFuzzyEngine } from './engines/postgres-trigram';
import { createFullTextEngine } from './engines/postgres-tsvector';
import type { SearchEngine } from './types';

/**
 * Explicit, auditable capability → adapter mapping (P10). No filesystem
 * discovery, no global mutable singleton: the production registry is built
 * from one static list, and tests inject replacement adapters through
 * {@link createSearchEngineRegistry} without touching routes or settings.
 */
export type SearchEngineRegistry = ReadonlyMap<SearchCapabilityId, SearchEngine>;

export function createSearchEngineRegistry(engines: readonly SearchEngine[]): SearchEngineRegistry {
  const registry = new Map<SearchCapabilityId, SearchEngine>();
  for (const engine of engines) {
    if (registry.has(engine.capability)) {
      throw new Error(`Duplicate search engine registration for capability "${engine.capability}"`);
    }
    registry.set(engine.capability, engine);
  }
  return registry;
}

let productionRegistry: SearchEngineRegistry | null = null;

/**
 * The one static registration of the current adapters:
 * `full_text` → PostgreSQL tsvector, `fuzzy` → PostgreSQL pg_trgm,
 * `semantic` → pgvector behind the existing AI-action lifecycle.
 * Replacing an implementation means changing exactly this list.
 */
export function productionSearchEngineRegistry(): SearchEngineRegistry {
  productionRegistry ??= createSearchEngineRegistry([
    createFullTextEngine(),
    createFuzzyEngine(),
    createSemanticEngine(),
  ]);
  return productionRegistry;
}
