import type { SearchCapabilityId } from '@next-wiki/shared';
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
