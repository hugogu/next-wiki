'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { HybridPageSearchResponse } from '@next-wiki/shared';

export const HYBRID_SEARCH_DEBOUNCE_MS = 250;
export const HYBRID_SEARCH_POLL_MS = 350;

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debounced;
}

export type UseHybridPageSearchInput = {
  enabled: boolean;
  query: string;
  searchSessionId: string | null;
};

/**
 * Owns one overlay-local, idempotent Header search attempt. The query key
 * keeps polling isolated by both the browser overlay session and the server
 * search record; a changed input receives a new record instead of overwriting
 * an in-flight response from an earlier query.
 */
export function useHybridPageSearch({ enabled, query, searchSessionId }: UseHybridPageSearchInput) {
  const normalizedQuery = query.trim();
  const canSearch = enabled && searchSessionId !== null && normalizedQuery.length >= 2;
  const debouncedQuery = useDebouncedValue(canSearch ? normalizedQuery : '', HYBRID_SEARCH_DEBOUNCE_MS);
  const active = canSearch && debouncedQuery === normalizedQuery;
  const attemptKey = active ? JSON.stringify([searchSessionId, debouncedQuery]) : null;
  const searchRecordId = useMemo(() => (attemptKey ? crypto.randomUUID() : null), [attemptKey]);

  const search = useQuery({
    queryKey: ['hybrid-page-search', searchSessionId, searchRecordId, debouncedQuery],
    enabled: active && searchSessionId !== null && searchRecordId !== null,
    queryFn: async ({ signal }): Promise<HybridPageSearchResponse> => {
      const response = await fetch('/api/v1/search/pages', {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'query',
          searchRecordId,
          searchSessionId,
          q: debouncedQuery,
          limit: 20,
        }),
      });
      if (!response.ok) throw new Error('Search request failed');
      return response.json() as Promise<HybridPageSearchResponse>;
    },
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: (queryState) => (
      queryState.state.data?.semanticState === 'pending' ? HYBRID_SEARCH_POLL_MS : false
    ),
  });

  return {
    data: active ? search.data ?? null : null,
    error: active ? search.error : null,
    isSearching: canSearch && (!active || search.isFetching),
    searchRecordId: active && (search.isFetching || search.isFetched) ? searchRecordId : null,
  };
}
