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
 * On a multilingual site the index is forced to a single language at publish
 * time so every page is searchable from every language page. The shell passes
 * that language through `data-search-language` and the panel loads Pagefind
 * with it explicitly. Single-language sites use the default behavior and keep
 * language-specific stemming.
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
  createInstance?: (opts: Record<string, unknown>) => PagefindApi;
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
 *
 * On a multilingual site we create a dedicated instance configured for the
 * forced index language, because Pagefind otherwise picks the page's own
 * `lang` and would look for a missing language partition.
 */
async function loadPagefind(basePath: string, searchLanguage?: string): Promise<PagefindApi> {
  const url = `${basePath}pagefind/pagefind.js`;
  const module_ = (await import(/* webpackIgnore: true */ /* @vite-ignore */ url)) as PagefindApi;

  if (searchLanguage && module_.createInstance) {
    const api = module_.createInstance({ language: searchLanguage });
    await api.init?.();
    return api;
  }

  await module_.init?.();
  return module_;
}

export function SearchPanel({
  basePath,
  strings,
  searchLanguage,
}: {
  basePath: string;
  strings: SearchPanelStrings;
  searchLanguage?: string;
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
        apiRef.current ??= await loadPagefind(basePath, searchLanguage);
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
    [basePath, searchLanguage],
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
