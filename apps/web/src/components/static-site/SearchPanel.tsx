'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/Input';

/**
 * Search for the published static site.
 *
 * Queries run entirely in the reader's browser against Pagefind's chunked
 * index: the first query fetches a small entry point and then only the shards
 * it touches, so a large wiki does not become a large download (FR-023).
 *
 * The query is mirrored into the URL's `q` parameter, so a search is
 * shareable and survives back/forward — the same contract the app's own
 * surfaces keep.
 *
 * Known limitation on multilingual sites: Pagefind partitions its index by the
 * document's `lang`, and a search covers the language of the page the reader is
 * on. So a reader on an English page finds English pages, and the same for
 * Chinese. Single-language sites — the common case — are unaffected. Merging
 * the partitions is tracked as its own task rather than guessed at here.
 */

type PagefindResultData = {
  url: string;
  excerpt: string;
  meta?: { title?: string };
};

type PagefindResult = { id: string; data: () => Promise<PagefindResultData> };

type PagefindApi = {
  init?: () => Promise<void>;
  options?: (opts: Record<string, unknown>) => Promise<void>;
  search: (query: string) => Promise<{ results: PagefindResult[] }>;
};

export type SearchPanelStrings = {
  label: string;
  placeholder: string;
  noResults: string;
};

const MAX_RESULTS = 10;
const DEBOUNCE_MS = 180;

/** A shared or bookmarked query, read at mount. This component only ever runs
 *  in the browser, so there is no hydration mismatch to guard against. */
function initialQuery(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('q') ?? '';
}

/**
 * Load Pagefind from the artifact.
 *
 * The path is built at runtime so the bundler leaves it alone: the index does
 * not exist at build time, and its location depends on the base path the site
 * is served from.
 */
async function loadPagefind(basePath: string): Promise<PagefindApi> {
  const url = `${basePath}pagefind/pagefind.js`;
  const api = (await import(/* webpackIgnore: true */ /* @vite-ignore */ url)) as PagefindApi;
  await api.init?.();
  return api;
}

export function SearchPanel({
  basePath,
  strings,
}: {
  basePath: string;
  strings: SearchPanelStrings;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<PagefindResultData[] | null>(null);
  const [open, setOpen] = useState(() => initialQuery() !== '');
  const [loading, setLoading] = useState(false);
  const apiRef = useRef<PagefindApi | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const run = useCallback(
    async (value: string) => {
      if (!value.trim()) {
        setResults(null);
        return;
      }
      setLoading(true);
      try {
        // Loaded on first use rather than on page load, so a reader who never
        // searches never downloads the index entry point.
        apiRef.current ??= await loadPagefind(basePath);
        const search = await apiRef.current.search(value);
        const data = await Promise.all(
          search.results.slice(0, MAX_RESULTS).map((result) => result.data()),
        );
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [basePath],
  );

  useEffect(() => {
    const handle = setTimeout(() => void run(query), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, run]);

  // Keep the address bar in step without pushing a history entry per keystroke.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    window.history.replaceState(null, '', url);
  }, [query]);

  useEffect(() => {
    const onClickAway = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        type="search"
        value={query}
        aria-label={strings.label}
        placeholder={strings.placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="w-48 md:w-64"
      />

      {open && query.trim() && !loading && results !== null ? (
        <div className="absolute right-0 top-full z-20 mt-xs max-h-96 w-96 overflow-y-auto rounded-md border border-border bg-background p-xs shadow-lg">
          {results.length === 0 ? (
            <p className="px-sm py-xs text-sm text-muted">{strings.noResults}</p>
          ) : (
            <ul>
              {results.map((result) => (
                <li key={result.url}>
                  <a
                    href={result.url}
                    className="block rounded-sm px-sm py-xs hover:bg-surface-elevated"
                  >
                    <span className="block text-sm font-medium">
                      {result.meta?.title ?? result.url}
                    </span>
                    <span
                      className="block text-xs text-muted"
                      // Pagefind's excerpt marks matches with <mark>; it is
                      // generated from the artifact's own HTML, not user input.
                      dangerouslySetInnerHTML={{ __html: result.excerpt }}
                    />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
